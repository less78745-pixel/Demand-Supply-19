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
    
    # ── Vectorized per-(Cabang, SKU) calculations ──
    # This used to loop row-by-row with `grouped.iterrows()`. That loop is
    # bounded by distinct (Cabang, SKU) pairs rather than raw uploaded rows,
    # but a full SKU-level catalog across many branches can still reach the
    # tens/hundreds of thousands of pairs, where the per-row Series
    # construction overhead of iterrows() adds up. Every calculation below is
    # pure elementwise arithmetic, so it vectorizes directly with identical
    # output.
    adu           = grouped['ADU'].astype(float).clip(lower=0)
    std_usage     = grouped['Std_Usage'].astype(float).clip(lower=0)
    lt            = grouped['Lead_Time'].astype(float).clip(lower=1)
    current_stock = grouped['Current_Stock'].astype(float).clip(lower=0)
    in_transit    = grouped['In_Transit'].astype(float).clip(lower=0)
    backorder     = grouped['Backorder'].astype(float).clip(lower=0)
    moq           = grouped['MOQ'].astype(float).clip(lower=0)
    order_cycle   = grouped['Order_Cycle'].astype(float).clip(lower=7)  # default 7 days

    # SS = Z × σ_demand × √Lead_Time
    safety_stock_v = z_score * std_usage * np.sqrt(lt)
    # ROP = (ADU × LT) + SS
    rop_v = (adu * lt) + safety_stock_v
    # Lead Time Factor: based on variability (higher = more buffer)
    lt_variability_factor = (std_usage / (adu + 0.001)).clip(lower=0.1, upper=0.8)
    # Yellow Zone = ADU × Lead_Time (primary coverage)
    yellow_zone_v = adu * lt
    # Red Zone = Yellow × LT_Factor × Variability_Factor (safety buffer),
    # at minimum equal to safety stock
    red_zone_v = np.maximum(yellow_zone_v * lt_variability_factor, safety_stock_v)
    # Green Zone = max(ADU × Order_Cycle, MOQ) (order generation)
    green_zone_v = np.maximum(adu * order_cycle, moq)
    top_of_buffer_v = red_zone_v + yellow_zone_v + green_zone_v
    net_flow_v = current_stock + in_transit - backorder

    status_v = pd.Series(np.select(
        [net_flow_v <= red_zone_v, net_flow_v <= (red_zone_v + yellow_zone_v), net_flow_v <= top_of_buffer_v],
        ["CRITICAL", "WARNING", "SAFE"], default="OVERSTOCK"
    ), index=grouped.index)
    status_color_v = pd.Series(np.select(
        [status_v == "CRITICAL", status_v == "WARNING", status_v == "SAFE"],
        ["red", "yellow", "green"], default="blue"
    ), index=grouped.index)

    safe_adu = adu.where(adu > 0, 1.0)
    dos_v = np.where(adu.values > 0, current_stock / safe_adu, 999.0)
    dos_capped_v = np.minimum(dos_v, 999)
    needs_reorder_v = net_flow_v <= rop_v
    qty_to_order_v = np.maximum(top_of_buffer_v - net_flow_v, moq)

    cabang_v = grouped['Cabang'].astype(str)
    sku_v = grouped['SKU'].astype(str)

    results = []
    alerts = []
    zone_data = []
    lead_time_matrix = []

    for i in range(len(grouped)):
        cabang = cabang_v.iat[i]
        sku = sku_v.iat[i]
        status = status_v.iat[i]
        status_color = status_color_v.iat[i]
        needs_reorder = bool(needs_reorder_v.iat[i])
        dos_capped = float(dos_capped_v[i])
        rop = float(rop_v.iat[i])
        net_flow = float(net_flow_v.iat[i])
        adu_i = float(adu.iat[i])

        # ── Alert if below ROP ──
        if needs_reorder and adu_i > 0:
            alerts.append({
                "cabang": cabang,
                "sku": sku,
                "current_stock": _safe_float(current_stock.iat[i]),
                "rop": _safe_float(rop),
                "deficit": _safe_float(rop - net_flow),
                "suggested_order_qty": _safe_float(qty_to_order_v.iat[i]),
                "days_of_supply": _safe_float(dos_capped),
                "urgency": "URGENT" if status == "CRITICAL" else "MONITOR",
            })

        results.append({
            "cabang": cabang,
            "sku": sku,
            "adu": _safe_float(adu_i),
            "std_usage": _safe_float(std_usage.iat[i]),
            "lead_time": _safe_float(lt.iat[i]),
            "z_score": _safe_float(z_score),
            "safety_stock": _safe_float(safety_stock_v.iat[i]),
            "rop": _safe_float(rop),
            "current_stock": _safe_float(current_stock.iat[i]),
            "in_transit": _safe_float(in_transit.iat[i]),
            "backorder": _safe_float(backorder.iat[i]),
            "net_flow": _safe_float(net_flow),
            "dos": _safe_float(dos_capped),
            "status": status,
            "status_color": status_color,
            "needs_reorder": needs_reorder,
        })

        zone_data.append({
            "cabang": cabang,
            "sku": sku,
            "red_zone": _safe_float(red_zone_v.iat[i]),
            "yellow_zone": _safe_float(yellow_zone_v.iat[i]),
            "green_zone": _safe_float(green_zone_v.iat[i]),
            "top_of_buffer": _safe_float(top_of_buffer_v.iat[i]),
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
    # Was recomputing `grouped.iterrows()` from scratch for each of the 6
    # service levels; `std_usage`/`lt` above are the same (non-negative,
    # >=1-clamped) values `row['Std_Usage']`/`max(row['Lead_Time'], 1)` used
    # per-row, so the per-service-level total is just their vectorized sum.
    simulations = []
    for sl in [0.90, 0.93, 0.95, 0.97, 0.98, 0.99]:
        z = _get_z_score(sl)
        total_ss = float((z * std_usage * np.sqrt(lt)).sum())
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
