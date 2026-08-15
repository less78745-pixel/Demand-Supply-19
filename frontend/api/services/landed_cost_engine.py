import pandas as pd
import numpy as np
import math
from datetime import datetime, timedelta
from utils.imputation import parse_flexible_date_series


def _safe_float(v):
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return round(val, 2)
    except Exception:
        return 0.0


def analyze_landed_cost(tracking_df: pd.DataFrame, allocation_df: pd.DataFrame, exchange_rate: float = 16000.0) -> dict:
    """
    Analyze import container clearance and landed cost.
    
    tracking_df columns: No_BL, No_Container, Status, ETA_Port, Free_Time_End, 
                          Freight_Cost_USD, Duty_USD, THC_USD, Inland_Transport_USD
    allocation_df columns: No_BL, SKU, Qty, Weight_Kg, Volume_CBM
    """
    
    # ── Column normalization ──
    for df in [tracking_df, allocation_df]:
        df.columns = df.columns.str.strip()
    
    # ── Normalize tracking columns ──
    t_map = {}
    for col in tracking_df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'bl' in cl or 'bill' in cl:
            t_map[col] = 'No_BL'
        elif 'container' in cl or 'kontainer' in cl:
            t_map[col] = 'No_Container'
        elif 'status' in cl:
            t_map[col] = 'Status'
        elif 'eta' in cl or ('port' in cl and 'date' in cl):
            t_map[col] = 'ETA_Port'
        elif 'free' in cl and 'time' in cl:
            t_map[col] = 'Free_Time_End'
        elif 'freight' in cl:
            t_map[col] = 'Freight_Cost_USD'
        elif 'duty' in cl or 'bea' in cl:
            t_map[col] = 'Duty_USD'
        elif 'thc' in cl:
            t_map[col] = 'THC_USD'
        elif 'inland' in cl or 'transport' in cl:
            t_map[col] = 'Inland_Transport_USD'
        elif 'cabang' in cl or 'dest' in cl or 'tujuan' in cl:
            t_map[col] = 'Cabang_Tujuan'
    tracking_df = tracking_df.rename(columns=t_map)
    
    # ── Normalize allocation columns ──
    a_map = {}
    for col in allocation_df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'bl' in cl or 'bill' in cl:
            a_map[col] = 'No_BL'
        elif 'sku' in cl or 'product' in cl or 'item' in cl:
            a_map[col] = 'SKU'
        elif 'qty' in cl or 'quantity' in cl:
            a_map[col] = 'Qty'
        elif 'weight' in cl or 'berat' in cl:
            a_map[col] = 'Weight_Kg'
        elif 'volume' in cl or 'cbm' in cl:
            a_map[col] = 'Volume_CBM'
    allocation_df = allocation_df.rename(columns=a_map)
    
    # ── Validate ──
    for name, df, req in [
        ('Tracking', tracking_df, ['No_BL', 'No_Container']),
        ('Allocation', allocation_df, ['No_BL', 'SKU', 'Qty']),
    ]:
        missing = [c for c in req if c not in df.columns]
        if missing:
            raise ValueError(f"File {name} missing columns: {', '.join(missing)}. Available: {', '.join(df.columns.tolist())}")
    
    # ── Defaults for optional columns ──
    if 'Status' not in tracking_df.columns:
        tracking_df['Status'] = 'On Water'
    if 'ETA_Port' not in tracking_df.columns:
        tracking_df['ETA_Port'] = (datetime.now() + timedelta(days=14)).strftime('%Y-%m-%d')
    if 'Free_Time_End' not in tracking_df.columns:
        tracking_df['Free_Time_End'] = (datetime.now() + timedelta(days=21)).strftime('%Y-%m-%d')
    if 'Cabang_Tujuan' not in tracking_df.columns:
        tracking_df['Cabang_Tujuan'] = 'Jakarta'
    
    for cost_col in ['Freight_Cost_USD', 'Duty_USD', 'THC_USD', 'Inland_Transport_USD']:
        if cost_col not in tracking_df.columns:
            tracking_df[cost_col] = 0
        tracking_df[cost_col] = pd.to_numeric(tracking_df[cost_col], errors='coerce').fillna(0)
    
    if 'Weight_Kg' not in allocation_df.columns:
        allocation_df['Weight_Kg'] = 1
    if 'Volume_CBM' not in allocation_df.columns:
        allocation_df['Volume_CBM'] = 0.01
    
    allocation_df['Qty'] = pd.to_numeric(allocation_df['Qty'], errors='coerce').fillna(0)
    allocation_df['Weight_Kg'] = pd.to_numeric(allocation_df['Weight_Kg'], errors='coerce').fillna(1)
    allocation_df['Volume_CBM'] = pd.to_numeric(allocation_df['Volume_CBM'], errors='coerce').fillna(0.01)
    
    today = datetime.now()

    # Parse once, up front, with the same flexible/robust parser used elsewhere
    # (handles Indonesian month names, 'Mon-YY' short forms, Excel serial dates).
    eta_col, _ = parse_flexible_date_series(tracking_df['ETA_Port'])
    free_end_col, _ = parse_flexible_date_series(tracking_df['Free_Time_End'])
    tracking_df = tracking_df.copy()
    # NOTE: itertuples() below renames any leading-underscore column to a
    # positional field name (namedtuple fields can't start with '_'), so these
    # internal columns are named without one to keep attribute access working.
    tracking_df['ETA_Parsed_Internal'] = eta_col
    tracking_df['FreeEnd_Parsed_Internal'] = free_end_col

    # ── Process each container ──
    containers = []
    sku_costs = []
    demurrage_alerts = []
    date_quality_issues = []

    # Group allocation rows by BL once instead of re-scanning the whole
    # allocation table for every container. The old
    # `allocation_df[allocation_df['No_BL'] == bl]` inside this loop was an
    # O(containers x allocation_rows) full-table scan per container - the
    # real bottleneck on a large upload (many containers x many SKU lines).
    #
    # Grouped into plain dicts (not a groupby-of-DataFrames) on purpose: with
    # many containers, calling .itertuples()/.iterrows() separately on each
    # tiny per-BL sub-DataFrame inside the loop below turned out to dominate
    # runtime in its own right (each call rebuilds a namedtuple class via
    # `eval` internally) - 20k containers meant 20k of those tiny per-group
    # itertuples() calls, which profiled far more expensive than one single
    # to_dict('records') pass up front plus plain-list iteration per row.
    alloc_by_bl: dict = {}
    for rec in allocation_df[['No_BL', 'SKU', 'Qty', 'Weight_Kg', 'Volume_CBM']].to_dict('records'):
        alloc_by_bl.setdefault(str(rec['No_BL']), []).append(rec)

    # itertuples() instead of iterrows(): both loops below are already O(n)
    # thanks to the alloc_by_bl grouping above, but itertuples skips building
    # a full pandas Series per row, which matters once "n" is tens of
    # thousands of containers/SKU lines.
    for t_row in tracking_df.itertuples(index=False):
        bl = str(t_row.No_BL)
        container = str(t_row.No_Container)
        status = str(t_row.Status)
        cabang = str(t_row.Cabang_Tujuan)

        eta = t_row.ETA_Parsed_Internal
        free_end = t_row.FreeEnd_Parsed_Internal
        # An ETA/Free Time we can't parse is a data-quality problem, not a safe
        # container — silently substituting "today + 14 days" here used to make
        # containers that were actually critically overdue (or whose real date
        # just used a format the parser didn't expect) look perfectly on schedule.
        has_bad_date = pd.isna(eta) or pd.isna(free_end)
        if has_bad_date:
            date_quality_issues.append({"no_bl": bl, "no_container": container})
        if pd.isna(eta):
            eta = today + timedelta(days=14)
        if pd.isna(free_end):
            free_end = eta + timedelta(days=7)

        # Total costs in USD
        freight = float(t_row.Freight_Cost_USD)
        duty = float(t_row.Duty_USD)
        thc = float(t_row.THC_USD)
        inland = float(t_row.Inland_Transport_USD)
        total_usd = freight + duty + thc + inland
        total_idr = total_usd * exchange_rate
        
        # Demurrage countdown
        days_remaining = (free_end - today).days
        # A container whose real dates we couldn't parse is treated as a risk
        # by default (needs a human to check it) instead of silently reporting
        # whatever the fabricated placeholder date happens to compute to.
        is_demurrage_risk = has_bad_date or days_remaining <= 3

        if is_demurrage_risk:
            demurrage_alerts.append({
                'no_bl': bl,
                'no_container': container,
                'status': status,
                'free_time_end': free_end.strftime('%Y-%m-%d'),
                'days_remaining': max(days_remaining, 0),
                'cabang': cabang,
                'urgency': 'DATA_ERROR' if has_bad_date else ('CRITICAL' if days_remaining <= 0 else 'WARNING'),
                'date_quality_issue': has_bad_date,
            })

        containers.append({
            'no_bl': bl,
            'no_container': container,
            'status': status,
            'eta_port': eta.strftime('%Y-%m-%d'),
            'free_time_end': free_end.strftime('%Y-%m-%d'),
            'days_to_free_time': max(days_remaining, 0),
            'is_demurrage_risk': is_demurrage_risk,
            'date_quality_issue': has_bad_date,
            'cabang_tujuan': cabang,
            'freight_usd': _safe_float(freight),
            'duty_usd': _safe_float(duty),
            'thc_usd': _safe_float(thc),
            'inland_usd': _safe_float(inland),
            'total_usd': _safe_float(total_usd),
            'total_idr': _safe_float(total_idr),
        })
        
        # ── Allocate cost to SKUs proportionally by weight ──
        bl_skus = alloc_by_bl.get(bl)
        if not bl_skus:
            continue

        total_weight = sum(float(r['Weight_Kg']) for r in bl_skus)
        if total_weight <= 0:
            total_weight = 1

        for s_row in bl_skus:
            sku = str(s_row['SKU'])
            qty = float(s_row['Qty'])
            weight = float(s_row['Weight_Kg'])
            volume = float(s_row['Volume_CBM'])
            
            weight_ratio = weight / total_weight
            sku_cost_usd = total_usd * weight_ratio
            sku_cost_idr = sku_cost_usd * exchange_rate
            cost_per_unit_idr = sku_cost_idr / qty if qty > 0 else 0
            
            sku_costs.append({
                'no_bl': bl,
                'sku': sku,
                'qty': _safe_float(qty),
                'weight_kg': _safe_float(weight),
                'volume_cbm': _safe_float(volume),
                'weight_ratio': _safe_float(weight_ratio * 100),
                'freight_alloc_usd': _safe_float(freight * weight_ratio),
                'duty_alloc_usd': _safe_float(duty * weight_ratio),
                'thc_alloc_usd': _safe_float(thc * weight_ratio),
                'inland_alloc_usd': _safe_float(inland * weight_ratio),
                'total_landed_usd': _safe_float(sku_cost_usd),
                'total_landed_idr': _safe_float(sku_cost_idr),
                'cost_per_unit_idr': _safe_float(cost_per_unit_idr),
                'cabang_tujuan': cabang,
            })
    
    # ── Monte Carlo Lead Time Simulation ──
    # Use ETA data to estimate lead time distribution
    etas = []
    for c in containers:
        try:
            eta_date = datetime.strptime(c['eta_port'], '%Y-%m-%d')
            lt = (eta_date - today).days
            if lt > 0:
                etas.append(lt)
        except Exception:
            pass
    
    monte_carlo = {}
    if len(etas) >= 2:
        mean_lt = np.mean(etas)
        std_lt = max(np.std(etas), 1)
        
        # Simulate 10,000 scenarios
        simulations = np.random.normal(mean_lt, std_lt, 10000)
        simulations = np.clip(simulations, 1, None)  # min 1 day
        
        # Histogram bins
        hist_bins = list(range(int(np.min(simulations)), int(np.max(simulations)) + 2))
        hist_counts, hist_edges = np.histogram(simulations, bins=min(20, len(hist_bins)))
        
        monte_carlo = {
            'mean_lead_time': _safe_float(mean_lt),
            'std_lead_time': _safe_float(std_lt),
            'p50': _safe_float(np.percentile(simulations, 50)),
            'p75': _safe_float(np.percentile(simulations, 75)),
            'p90': _safe_float(np.percentile(simulations, 90)),
            'p95': _safe_float(np.percentile(simulations, 95)),
            'p99': _safe_float(np.percentile(simulations, 99)),
            'histogram': [
                {'bin': f"{int(hist_edges[i])}-{int(hist_edges[i+1])}", 'count': int(hist_counts[i])}
                for i in range(len(hist_counts))
            ],
            'recommendation': f"Untuk jaminan 95% barang tiba tepat waktu, PO impor harus diterbitkan {int(np.percentile(simulations, 95))} hari sebelumnya (bukan {int(mean_lt)} hari).",
        }
    
    # ── Currency simulation ──
    currency_sims = []
    rates = [14500, 15000, 15500, 16000, 16500, 17000, 17500]
    total_usd_all = sum(c['total_usd'] for c in containers)
    for rate in rates:
        currency_sims.append({
            'rate': f"Rp {rate:,}".replace(',', '.'),
            'rate_value': rate,
            'total_idr': _safe_float(total_usd_all * rate),
            'is_current': rate == exchange_rate,
        })
    
    # ── KPI ──
    result = {
        'containers': containers,
        'sku_costs': sku_costs,
        'demurrage_alerts': sorted(demurrage_alerts, key=lambda x: x['days_remaining']),
        'monte_carlo': monte_carlo,
        'currency_simulations': currency_sims,
        'kpi': {
            'total_containers': len(containers),
            'total_cost_usd': _safe_float(total_usd_all),
            'total_cost_idr': _safe_float(total_usd_all * exchange_rate),
            'exchange_rate': exchange_rate,
            'demurrage_risk_count': len(demurrage_alerts),
            'avg_cost_per_unit': _safe_float(
                np.mean([s['cost_per_unit_idr'] for s in sku_costs]) if sku_costs else 0
            ),
            'total_skus': len(set(s['sku'] for s in sku_costs)),
        },
        'analysis_date': datetime.now().strftime("%Y-%m-%d %H:%M"),
    }

    if date_quality_issues:
        bls = ", ".join(d["no_bl"] for d in date_quality_issues[:15])
        more = f", dan {len(date_quality_issues) - 15} lainnya" if len(date_quality_issues) > 15 else ""
        result['warning'] = (
            f"⚠️ {len(date_quality_issues)} kontainer memiliki ETA_Port/Free_Time_End yang tidak terbaca "
            f"sebagai tanggal valid dan ditandai DATA_ERROR (dianggap berisiko sampai diperiksa manual): {bls}{more}."
        )

    return result
