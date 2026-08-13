import pandas as pd
import numpy as np
import math
from datetime import datetime


def _safe_float(v):
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return round(val, 2)
    except Exception:
        return 0.0


def analyze_rebalancing(stock_df: pd.DataFrame, demand_df: pd.DataFrame, freight_df: pd.DataFrame) -> dict:
    """
    Optimize inter-branch stock rebalancing.
    
    stock_df columns: Cabang, SKU, Qty_Available
    demand_df columns: Cabang, Entity, SKU, Qty_Needed, Max_Lead_Time_Days
    freight_df columns: Origin, Destination, Mode, Cost_Per_Ton, Capacity_Max, Lead_Time_Est
    """
    
    # ── Column normalization ──
    for df in [stock_df, demand_df, freight_df]:
        df.columns = df.columns.str.strip()
    
    # ── Normalize stock columns ──
    stock_cols = {}
    for col in stock_df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'cabang' in cl or 'branch' in cl or 'origin' in cl:
            stock_cols[col] = 'Cabang'
        elif 'sku' in cl or 'product' in cl or 'item' in cl:
            stock_cols[col] = 'SKU'
        elif 'qty' in cl or 'available' in cl or 'stock' in cl:
            stock_cols[col] = 'Qty_Available'
    stock_df = stock_df.rename(columns=stock_cols)
    
    # ── Normalize demand columns ──
    demand_cols = {}
    for col in demand_df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'cabang' in cl or 'branch' in cl or 'destination' in cl or 'tujuan' in cl:
            demand_cols[col] = 'Cabang'
        elif 'entity' in cl or 'perusahaan' in cl or 'company' in cl or 'pt' in cl:
            demand_cols[col] = 'Entity'
        elif 'sku' in cl or 'product' in cl or 'item' in cl:
            demand_cols[col] = 'SKU'
        elif 'qty' in cl or 'needed' in cl or 'demand' in cl or 'defisit' in cl:
            demand_cols[col] = 'Qty_Needed'
        elif 'max' in cl and ('lead' in cl or 'time' in cl or 'hari' in cl):
            demand_cols[col] = 'Max_Lead_Time_Days'
    demand_df = demand_df.rename(columns=demand_cols)
    
    # ── Normalize freight columns ──
    freight_cols = {}
    for col in freight_df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'origin' in cl or 'asal' in cl:
            freight_cols[col] = 'Origin'
        elif 'destination' in cl or 'tujuan' in cl or 'dest' in cl:
            freight_cols[col] = 'Destination'
        elif 'mode' in cl or 'moda' in cl:
            freight_cols[col] = 'Mode'
        elif 'cost' in cl or 'biaya' in cl or 'tarif' in cl:
            freight_cols[col] = 'Cost_Per_Ton'
        elif 'capacity' in cl or 'kapasitas' in cl:
            freight_cols[col] = 'Capacity_Max'
        elif 'lead' in cl or 'time' in cl or 'waktu' in cl:
            freight_cols[col] = 'Lead_Time_Est'
    freight_df = freight_df.rename(columns=freight_cols)
    
    # ── Validate ──
    for name, df, req in [
        ('Stock', stock_df, ['Cabang', 'SKU', 'Qty_Available']),
        ('Demand', demand_df, ['Cabang', 'SKU', 'Qty_Needed']),
        ('Freight', freight_df, ['Origin', 'Destination', 'Mode', 'Cost_Per_Ton']),
    ]:
        missing = [c for c in req if c not in df.columns]
        if missing:
            raise ValueError(f"File {name} missing columns: {', '.join(missing)}. Available: {', '.join(df.columns.tolist())}")
    
    # ── Ensure optional columns ──
    if 'Entity' not in demand_df.columns:
        demand_df['Entity'] = 'Default'
    if 'Max_Lead_Time_Days' not in demand_df.columns:
        demand_df['Max_Lead_Time_Days'] = 30
    if 'Capacity_Max' not in freight_df.columns:
        freight_df['Capacity_Max'] = 99999
    if 'Lead_Time_Est' not in freight_df.columns:
        freight_df['Lead_Time_Est'] = 7
    
    # Ensure numeric
    stock_df['Qty_Available'] = pd.to_numeric(stock_df['Qty_Available'], errors='coerce').fillna(0)
    demand_df['Qty_Needed'] = pd.to_numeric(demand_df['Qty_Needed'], errors='coerce').fillna(0)
    demand_df['Max_Lead_Time_Days'] = pd.to_numeric(demand_df['Max_Lead_Time_Days'], errors='coerce').fillna(30)
    freight_df['Cost_Per_Ton'] = pd.to_numeric(freight_df['Cost_Per_Ton'], errors='coerce').fillna(0)
    freight_df['Capacity_Max'] = pd.to_numeric(freight_df['Capacity_Max'], errors='coerce').fillna(99999)
    freight_df['Lead_Time_Est'] = pd.to_numeric(freight_df['Lead_Time_Est'], errors='coerce').fillna(7)
    
    # ── Build supply map (available stock per origin-SKU) ──
    supply = {}
    for _, row in stock_df.iterrows():
        key = (str(row['Cabang']), str(row['SKU']))
        supply[key] = supply.get(key, 0) + float(row['Qty_Available'])
    
    # ── Build freight lookup ──
    freight_lookup = {}
    for _, row in freight_df.iterrows():
        key = (str(row['Origin']), str(row['Destination']))
        if key not in freight_lookup:
            freight_lookup[key] = []
        freight_lookup[key].append({
            'mode': str(row['Mode']),
            'cost': float(row['Cost_Per_Ton']),
            'capacity': float(row['Capacity_Max']),
            'lead_time': float(row['Lead_Time_Est']),
        })
    
    # Sort each route by cost (cheapest first)
    for key in freight_lookup:
        freight_lookup[key].sort(key=lambda x: x['cost'])
    
    # ── Greedy optimization per Entity (STRICT partition) ──
    recommendations = []
    infeasible = []
    total_cost = 0
    total_cost_central = 0  # comparison: what if all from central
    
    # Group demand by Entity first (STRICT separation)
    demand_by_entity = demand_df.groupby('Entity')
    
    for entity, entity_demands in demand_by_entity:
        for _, demand_row in entity_demands.iterrows():
            dest = str(demand_row['Cabang'])
            sku = str(demand_row['SKU'])
            qty_needed = float(demand_row['Qty_Needed'])
            max_lt = float(demand_row['Max_Lead_Time_Days'])
            remaining = qty_needed
            
            if remaining <= 0:
                continue
            
            # Find all possible origins with stock for this SKU
            candidates = []
            for (origin, s_sku), avail in supply.items():
                if s_sku != sku or avail <= 0 or origin == dest:
                    continue
                routes = freight_lookup.get((origin, dest), [])
                for route in routes:
                    # Pre-filter: disqualify if lead time exceeds target
                    if route['lead_time'] > max_lt:
                        continue
                    candidates.append({
                        'origin': origin,
                        'available': avail,
                        'mode': route['mode'],
                        'cost': route['cost'],
                        'capacity': route['capacity'],
                        'lead_time': route['lead_time'],
                    })
            
            # Sort candidates by cost (cheapest first — greedy)
            candidates.sort(key=lambda x: x['cost'])
            
            for cand in candidates:
                if remaining <= 0:
                    break
                
                send_qty = min(remaining, cand['available'], cand['capacity'])
                if send_qty <= 0:
                    continue
                
                cost = send_qty * cand['cost']
                total_cost += cost
                
                # Deduct from supply
                supply_key = (cand['origin'], sku)
                supply[supply_key] = supply.get(supply_key, 0) - send_qty
                
                recommendations.append({
                    'entity': str(entity),
                    'origin': cand['origin'],
                    'destination': dest,
                    'sku': sku,
                    'qty': _safe_float(send_qty),
                    'mode': cand['mode'],
                    'cost_per_ton': _safe_float(cand['cost']),
                    'total_cost': _safe_float(cost),
                    'lead_time': _safe_float(cand['lead_time']),
                    'max_allowed_lt': _safe_float(max_lt),
                })
                
                remaining -= send_qty
            
            # Estimate central WH cost for comparison
            central_routes = freight_lookup.get(('Jakarta', dest), freight_lookup.get(('Surabaya', dest), []))
            if central_routes:
                central_cost = qty_needed * central_routes[0]['cost']
                total_cost_central += central_cost
            
            if remaining > 0:
                infeasible.append({
                    'entity': str(entity),
                    'destination': dest,
                    'sku': sku,
                    'qty_unfulfilled': _safe_float(remaining),
                    'reason': 'Stok tidak cukup atau tidak ada rute yang memenuhi lead time constraint',
                })
    
    # ── Summary by origin-destination pair ──
    route_summary = {}
    for rec in recommendations:
        key = f"{rec['origin']}→{rec['destination']}"
        if key not in route_summary:
            route_summary[key] = {'route': key, 'total_qty': 0, 'total_cost': 0, 'transfers': 0}
        route_summary[key]['total_qty'] += rec['qty']
        route_summary[key]['total_cost'] += rec['total_cost']
        route_summary[key]['transfers'] += 1
    
    savings = max(total_cost_central - total_cost, 0)

    return {
        'recommendations': recommendations,
        'infeasible': infeasible,
        'route_summary': list(route_summary.values()),
        'kpi': {
            'total_transfers': len(recommendations),
            'total_cost': _safe_float(total_cost),
            'total_cost_central': _safe_float(total_cost_central),
            'savings': _safe_float(savings),
            'savings_pct': _safe_float((savings / total_cost_central * 100) if total_cost_central > 0 else 0),
            'infeasible_count': len(infeasible),
            'entities_served': len(set(r['entity'] for r in recommendations)),
        },
        'analysis_date': datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
