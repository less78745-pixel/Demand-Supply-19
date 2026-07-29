import pandas as pd
import numpy as np
import math
from datetime import datetime

# ── 28 Cabang Reference ──
CABANG_LIST = [
    "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar",
    "Palembang", "Denpasar", "Balikpapan", "Manado", "Pontianak", "Banjarmasin",
    "Lampung", "Padang", "Pekanbaru", "Jambi", "Bengkulu", "Mataram",
    "Kupang", "Ambon", "Jayapura", "Sorong", "Ternate", "Kendari",
    "Palu", "Gorontalo", "Cirebon", "Yogyakarta"
]

# ── Z-Score lookup for service levels ──
Z_SCORE_TABLE = {
    0.90: 1.282,
    0.91: 1.341,
    0.92: 1.405,
    0.93: 1.476,
    0.94: 1.555,
    0.95: 1.645,
    0.96: 1.751,
    0.97: 1.881,
    0.98: 2.054,
    0.99: 2.326,
}


def _safe_float(v):
    """Convert to float safely, returning 0.0 for NaN/Inf."""
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return round(val, 2)
    except Exception:
        return 0.0


def _get_z_score(service_level: float) -> float:
    """Get Z-score for a given service level (0.0 to 1.0)."""
    if service_level <= 0 or service_level >= 1:
        service_level = 0.95
    # Find closest key
    closest = min(Z_SCORE_TABLE.keys(), key=lambda k: abs(k - service_level))
    return Z_SCORE_TABLE[closest]


def analyze_safety_stock(df: pd.DataFrame, service_level: float = 0.95) -> dict:
    """
    Analyze safety stock and ROP from uploaded data.
    
    Expected columns:
    - Cabang: Branch name
    - SKU: Product code
    - Daily_Usage: Historical daily usage (one row per day ideally, or average)
    - Lead_Time_Days: Supply lead time in days
    - Current_Stock: (optional) current stock level
    - In_Transit: (optional) goods in transit
    - Backorder: (optional) pending orders
    - MOQ: (optional) minimum order quantity
    - Order_Cycle_Days: (optional) reorder cycle in days
    """
    
    # ── Column normalization ──
    df.columns = df.columns.str.strip()
    
    # Map flexible column names
    col_map = {}
    for col in df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'cabang' in cl or 'branch' in cl:
            col_map[col] = 'Cabang'
        elif 'sku' in cl or 'product' in cl or 'item' in cl or 'kode' in cl:
            col_map[col] = 'SKU'
        elif 'daily' in cl and 'usage' in cl:
            col_map[col] = 'Daily_Usage'
        elif 'lead' in cl and 'time' in cl:
            col_map[col] = 'Lead_Time_Days'
        elif 'current' in cl and 'stock' in cl:
            col_map[col] = 'Current_Stock'
        elif 'transit' in cl:
            col_map[col] = 'In_Transit'
        elif 'backorder' in cl or 'back_order' in cl:
            col_map[col] = 'Backorder'
        elif 'moq' in cl or 'minimum_order' in cl:
            col_map[col] = 'MOQ'
        elif 'order_cycle' in cl or 'cycle_days' in cl:
            col_map[col] = 'Order_Cycle_Days'
    
    df = df.rename(columns=col_map)
    
    # Validate required columns
    required = ['Cabang', 'SKU', 'Daily_Usage', 'Lead_Time_Days']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(
            f"Kolom wajib tidak ditemukan: {', '.join(missing)}. "
            f"Kolom tersedia: {', '.join(df.columns.tolist())}"
        )
    
    # Ensure numeric
    for col in ['Daily_Usage', 'Lead_Time_Days']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    for col in ['Current_Stock', 'In_Transit', 'Backorder', 'MOQ', 'Order_Cycle_Days']:
        if col not in df.columns:
            df[col] = 0
        else:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    z_score = _get_z_score(service_level)
    
    # ── Aggregate per Cabang-SKU ──
    grouped = df.groupby(['Cabang', 'SKU']).agg(
        ADU=('Daily_Usage', 'mean'),
        Std_Usage=('Daily_Usage', 'std'),
        Lead_Time=('Lead_Time_Days', 'mean'),
        Current_Stock=('Current_Stock', 'last'),
        In_Transit=('In_Transit', 'sum'),
        Backorder=('Backorder', 'sum'),
        MOQ=('MOQ', 'max'),
        Order_Cycle=('Order_Cycle_Days', 'max'),
    ).reset_index()
    
    # Fill NaN std with 0 (single data point)
    grouped['Std_Usage'] = grouped['Std_Usage'].fillna(0)
    
    results = []
    alerts = []
    zone_data = []
    lead_time_matrix = []
    
    for _, row in grouped.iterrows():
        cabang = str(row['Cabang'])
        sku = str(row['SKU'])
        adu = max(float(row['ADU']), 0)
        std_usage = max(float(row['Std_Usage']), 0)
        lt = max(float(row['Lead_Time']), 1)
        current_stock = max(float(row['Current_Stock']), 0)
        in_transit = max(float(row['In_Transit']), 0)
        backorder = max(float(row['Backorder']), 0)
        moq = max(float(row['MOQ']), 0)
        order_cycle = max(float(row['Order_Cycle']), 7)  # default 7 days
        
        # ── Safety Stock Calculation ──
        # SS = Z × σ_demand × √Lead_Time
        safety_stock = z_score * std_usage * math.sqrt(lt)
        
        # ── Reorder Point ──
        # ROP = (ADU × LT) + SS
        rop = (adu * lt) + safety_stock
        
        # ── DDMRP Zones ──
        # Lead Time Factor: based on variability (higher = more buffer)
        lt_variability_factor = min(max(std_usage / (adu + 0.001), 0.1), 0.8)
        
        # Yellow Zone = ADU × Lead_Time (primary coverage)
        yellow_zone = adu * lt
        
        # Red Zone = Yellow × LT_Factor × Variability_Factor (safety buffer)
        red_zone = yellow_zone * lt_variability_factor
        red_zone = max(red_zone, safety_stock)  # At minimum, equal to safety stock
        
        # Green Zone = max(ADU × Order_Cycle, MOQ) (order generation)
        green_zone = max(adu * order_cycle, moq)
        
        # Top of Buffer
        top_of_buffer = red_zone + yellow_zone + green_zone
        
        # ── Net Flow Position ──
        net_flow = current_stock + in_transit - backorder
        
        # ── Status determination ──
        if net_flow <= red_zone:
            status = "CRITICAL"
            status_color = "red"
        elif net_flow <= (red_zone + yellow_zone):
            status = "WARNING"
            status_color = "yellow"
        elif net_flow <= top_of_buffer:
            status = "SAFE"
            status_color = "green"
        else:
            status = "OVERSTOCK"
            status_color = "blue"
        
        # ── Days of Supply ──
        dos = (current_stock / adu) if adu > 0 else 999
        
        # ── Alert if below ROP ──
        needs_reorder = net_flow <= rop
        if needs_reorder and adu > 0:
            qty_to_order = max(top_of_buffer - net_flow, moq)
            alerts.append({
                "cabang": cabang,
                "sku": sku,
                "current_stock": _safe_float(current_stock),
                "rop": _safe_float(rop),
                "deficit": _safe_float(rop - net_flow),
                "suggested_order_qty": _safe_float(qty_to_order),
                "days_of_supply": _safe_float(min(dos, 999)),
                "urgency": "URGENT" if status == "CRITICAL" else "MONITOR",
            })
        
        results.append({
            "cabang": cabang,
            "sku": sku,
            "adu": _safe_float(adu),
            "std_usage": _safe_float(std_usage),
            "lead_time": _safe_float(lt),
            "z_score": _safe_float(z_score),
            "safety_stock": _safe_float(safety_stock),
            "rop": _safe_float(rop),
            "current_stock": _safe_float(current_stock),
            "in_transit": _safe_float(in_transit),
            "backorder": _safe_float(backorder),
            "net_flow": _safe_float(net_flow),
            "dos": _safe_float(min(dos, 999)),
            "status": status,
            "status_color": status_color,
            "needs_reorder": needs_reorder,
        })
        
        zone_data.append({
            "cabang": cabang,
            "sku": sku,
            "red_zone": _safe_float(red_zone),
            "yellow_zone": _safe_float(yellow_zone),
            "green_zone": _safe_float(green_zone),
            "top_of_buffer": _safe_float(top_of_buffer),
            "net_flow": _safe_float(net_flow),
            "status": status,
        })
    
    # ── Lead Time Matrix (Cabang summary) ──
    lt_summary = grouped.groupby('Cabang').agg(
        avg_lead_time=('Lead_Time', 'mean'),
        max_lead_time=('Lead_Time', 'max'),
        min_lead_time=('Lead_Time', 'min'),
        sku_count=('SKU', 'count'),
    ).reset_index()
    
    for _, row in lt_summary.iterrows():
        lead_time_matrix.append({
            "cabang": str(row['Cabang']),
            "avg_lead_time": _safe_float(row['avg_lead_time']),
            "max_lead_time": _safe_float(row['max_lead_time']),
            "min_lead_time": _safe_float(row['min_lead_time']),
            "sku_count": int(row['sku_count']),
        })
    
    # ── KPI Summary ──
    total_skus = len(results)
    critical_count = sum(1 for r in results if r['status'] == 'CRITICAL')
    warning_count = sum(1 for r in results if r['status'] == 'WARNING')
    safe_count = sum(1 for r in results if r['status'] == 'SAFE')
    overstock_count = sum(1 for r in results if r['status'] == 'OVERSTOCK')
    avg_dos = np.mean([r['dos'] for r in results]) if results else 0
    avg_ss = np.mean([r['safety_stock'] for r in results]) if results else 0
    reorder_count = sum(1 for r in results if r['needs_reorder'])
    
    # ── Service Level Simulation ──
    simulations = []
    for sl in [0.90, 0.93, 0.95, 0.97, 0.98, 0.99]:
        z = _get_z_score(sl)
        total_ss = sum(
            z * float(row['Std_Usage']) * math.sqrt(max(float(row['Lead_Time']), 1))
            for _, row in grouped.iterrows()
        )
        simulations.append({
            "service_level": f"{int(sl*100)}%",
            "z_score": round(z, 3),
            "total_safety_stock": _safe_float(total_ss),
        })
    
    return {
        "results": results,
        "alerts": sorted(alerts, key=lambda x: x['deficit'], reverse=True),
        "zone_data": zone_data,
        "lead_time_matrix": lead_time_matrix,
        "service_level_simulations": simulations,
        "kpi": {
            "total_skus": total_skus,
            "critical_count": critical_count,
            "warning_count": warning_count,
            "safe_count": safe_count,
            "overstock_count": overstock_count,
            "reorder_alerts": reorder_count,
            "avg_dos": _safe_float(avg_dos),
            "avg_safety_stock": _safe_float(avg_ss),
            "service_level": f"{int(service_level*100)}%",
        },
        "analysis_date": datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
