import pandas as pd
import numpy as np
import math

def _safe_float(v):
    """Safely cast to float and replace NaN or Inf with 0.0 to avoid JSON serialization errors."""
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except Exception:
        return 0.0

def calculate_occupancy(df: pd.DataFrame) -> dict:
    """
    Calculate daily occupancy per category per branch.
    Also runs ABC-XYZ inventory analysis on the same data.
    
    Logic:
    - Balance = On_Hand_start + In - Out  per category per date
    - Occupancy% = balance / branch_capacity * 100
    - Capacity is ONE value per Cabang (total warehouse capacity for that branch)
    - Forward-fill missing dates for each category to carry forward previous balances.
    """
    if df.empty:
        return {
            "daily_data": [],
            "branch_date_summary": [],
            "shortage_alerts": [],
            "kpi_summary": {"avg_occupancy": 0, "max_occupancy": 0, "categories_at_risk": 0},
            "inventory_analysis": None
        }

    if 'Cabang' not in df.columns:
        df['Cabang'] = 'Unknown'
    if 'Category' not in df.columns:
        df['Category'] = 'Unknown'

    df = df.copy()
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df = df.dropna(subset=['Date'])
    df['Cabang'] = df['Cabang'].astype(str).str.strip()
    df['Category'] = df['Category'].astype(str).str.strip()
    df = df.sort_values(by=['Cabang', 'Category', 'Date'])

    cabangs = df['Cabang'].unique()
    
    # ── Langkah 1-3: Kalkulasi Saldo Berjalan per Kategori ──
    category_balances = []
    for cabang in cabangs:
        cabang_df = df[df['Cabang'] == cabang]
        categories = cabang_df['Category'].unique()

        for cat in categories:
            cat_df = cabang_df[cabang_df['Category'] == cat].copy()
            cat_df = cat_df.groupby('Date').agg({'In': 'sum', 'Out': 'sum', 'On Hand': 'first'}).reset_index()
            cat_df = cat_df.sort_values('Date')
            
            prev_balance = 0
            for idx, row in cat_df.iterrows():
                inbound = _safe_float(row.get('In', 0))
                outbound = _safe_float(row.get('Out', 0))
                
                if idx == 0:
                    current_balance = _safe_float(row.get('On Hand', 0))
                else:
                    current_balance = prev_balance + inbound - outbound
                
                prev_balance = current_balance
                
                category_balances.append({
                    'Cabang': cabang,
                    'Category': cat,
                    'Date': row['Date'],
                    'running_balance': current_balance
                })

    df_cat_balances = pd.DataFrame(category_balances)
    
    daily_data = []
    shortage_alerts = []

    # ── Langkah 4: Forward-fill tanggal yang kosong dan agregasi ──
    if not df_cat_balances.empty:
        min_date = df_cat_balances['Date'].min()
        max_date = df_cat_balances['Date'].max()
        all_dates = pd.date_range(start=min_date, end=max_date, freq='D')

        pivoted = df_cat_balances.pivot(index='Date', columns=['Cabang', 'Category'], values='running_balance')
        pivoted = pivoted.reindex(all_dates)
        pivoted = pivoted.ffill()
        pivoted = pivoted.fillna(0)
        pivoted.index.name = 'Date'
        
        filled_cat_balances = pivoted.unstack().reset_index(name='running_balance')
        
        for cabang in cabangs:
            cabang_orig_df = df[df['Cabang'] == cabang]
            cap_series = pd.to_numeric(cabang_orig_df['Capacity'], errors='coerce').dropna()
            capacity_val = _safe_float(cap_series.iloc[0]) if len(cap_series) > 0 else 1.0
            if capacity_val <= 0: capacity_val = 1.0

            c_balances = filled_cat_balances[filled_cat_balances['Cabang'] == cabang]
            if c_balances.empty: continue
            
            b_agg = c_balances.groupby('Date')['running_balance'].sum().reset_index()
            b_agg = b_agg.sort_values('Date')
            
            for _, row in b_agg.iterrows():
                date_str = row['Date'].strftime('%Y-%m-%d')
                total_balance = _safe_float(row['running_balance'])
                occupancy_pct = _safe_float(round((total_balance / capacity_val) * 100, 4))
                is_shortage = total_balance < 0

                daily_data.append({
                    'cabang':        str(cabang),
                    'date':          date_str,
                    'total_on_hand': total_balance,
                    'capacity':      capacity_val,
                    'occupancy_pct': occupancy_pct,
                    'is_shortage':   is_shortage
                })

        # Find shortages per category
        for _, row in filled_cat_balances.iterrows():
            rb = _safe_float(row['running_balance'])
            if rb < 0:
                shortage_alerts.append({
                    'cabang': str(row['Cabang']),
                    'category': str(row['Category']),
                    'date': row['Date'].strftime('%Y-%m-%d'),
                    'deficit': round(rb, 2)
                })

    branch_date_summary = daily_data.copy()

    # ── KPIs ──
    if daily_data:
        avg_occ = sum(d['occupancy_pct'] for d in daily_data) / len(daily_data)
        max_occ = max(d['occupancy_pct'] for d in daily_data)
        cats_at_risk = len(shortage_alerts)
    else:
        avg_occ = max_occ = cats_at_risk = 0

    # ── Run Inventory Analysis (ABC-XYZ) on same data ──
    inventory_result = None
    try:
        inventory_result = _run_inventory_from_occupancy(df)
    except Exception:
        pass

    return {
        "daily_data":          daily_data,
        "branch_date_summary": branch_date_summary,
        "shortage_alerts":     shortage_alerts,
        "kpi_summary": {
            "avg_occupancy":      round(avg_occ, 2),
            "max_occupancy":      round(max_occ, 2),
            "categories_at_risk": cats_at_risk
        },
        "inventory_analysis":  inventory_result
    }


def _run_inventory_from_occupancy(df: pd.DataFrame) -> dict:
    """
    Run ABC-XYZ classification using occupancy data.
    Maps: Out → Penjualan (sales proxy), On Hand stays.
    """
    from services.inventory_engine import run_inventory_analysis

    inv_df = df.copy()
    # Map occupancy columns to inventory columns
    if 'Out' in inv_df.columns and 'Penjualan' not in inv_df.columns:
        inv_df['Penjualan'] = inv_df['Out']
    
    # Ensure required columns exist
    required = ['Category', 'Date', 'Penjualan', 'On Hand']
    missing = [c for c in required if c not in inv_df.columns]
    if missing:
        return None
    
    if 'Cabang' not in inv_df.columns:
        inv_df['Cabang'] = 'Unknown'

    return run_inventory_analysis(inv_df)
