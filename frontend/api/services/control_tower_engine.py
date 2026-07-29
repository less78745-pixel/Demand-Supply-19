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


# Region mapping for 28 branches
REGION_MAP = {
    "Jakarta": "Jawa", "Bandung": "Jawa", "Semarang": "Jawa",
    "Cirebon": "Jawa", "Yogyakarta": "Jawa", "Surabaya": "Jawa",
    "Medan": "Sumatera", "Palembang": "Sumatera", "Lampung": "Sumatera",
    "Padang": "Sumatera", "Pekanbaru": "Sumatera", "Jambi": "Sumatera",
    "Bengkulu": "Sumatera",
    "Pontianak": "Kalimantan", "Banjarmasin": "Kalimantan", "Balikpapan": "Kalimantan",
    "Makassar": "Sulawesi", "Manado": "Sulawesi", "Kendari": "Sulawesi",
    "Palu": "Sulawesi", "Gorontalo": "Sulawesi",
    "Denpasar": "Bali & Nusa Tenggara", "Mataram": "Bali & Nusa Tenggara",
    "Kupang": "Bali & Nusa Tenggara",
    "Ambon": "Maluku & Papua", "Jayapura": "Maluku & Papua",
    "Sorong": "Maluku & Papua", "Ternate": "Maluku & Papua",
}


def analyze_control_tower(df: pd.DataFrame) -> dict:
    """
    Analyze SCM health across 28 branches for Control Tower dashboard.
    
    Expected columns:
    - Cabang: Branch name
    - In_Stock_Rate: Percentage (0-100)
    - Days_of_Supply: Number of days
    - OTIF_Score: On-Time In-Full percentage (0-100)
    - Current_Stock: (optional) current stock level
    - ROP_Level: (optional) reorder point level
    - Category: (optional) product category
    """
    
    df.columns = df.columns.str.strip()
    
    col_map = {}
    for col in df.columns:
        cl = col.lower().replace(' ', '_').replace('-', '_')
        if 'cabang' in cl or 'branch' in cl:
            col_map[col] = 'Cabang'
        elif 'in_stock' in cl or 'instock' in cl or 'fill_rate' in cl:
            col_map[col] = 'In_Stock_Rate'
        elif 'days' in cl and ('supply' in cl or 'dos' in cl or 'cover' in cl):
            col_map[col] = 'Days_of_Supply'
        elif 'otif' in cl or 'on_time' in cl:
            col_map[col] = 'OTIF_Score'
        elif 'current' in cl and 'stock' in cl:
            col_map[col] = 'Current_Stock'
        elif 'rop' in cl or 'reorder' in cl:
            col_map[col] = 'ROP_Level'
        elif 'categ' in cl or 'kategori' in cl:
            col_map[col] = 'Category'
        elif 'region' in cl or 'wilayah' in cl:
            col_map[col] = 'Region'
        elif 'sku' in cl or 'product' in cl or 'item' in cl:
            col_map[col] = 'SKU'
    df = df.rename(columns=col_map)
    
    required = ['Cabang']
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Kolom wajib tidak ditemukan: {', '.join(missing)}. Available: {', '.join(df.columns.tolist())}")
    
    # Defaults
    if 'In_Stock_Rate' not in df.columns:
        df['In_Stock_Rate'] = 90
    if 'Days_of_Supply' not in df.columns:
        df['Days_of_Supply'] = 15
    if 'OTIF_Score' not in df.columns:
        df['OTIF_Score'] = 85
    if 'Current_Stock' not in df.columns:
        df['Current_Stock'] = 0
    if 'ROP_Level' not in df.columns:
        df['ROP_Level'] = 0
    if 'Category' not in df.columns:
        df['Category'] = 'General'
    if 'Region' not in df.columns:
        df['Region'] = df['Cabang'].map(REGION_MAP).fillna('Lainnya')
    
    # Ensure numeric
    for col in ['In_Stock_Rate', 'Days_of_Supply', 'OTIF_Score', 'Current_Stock', 'ROP_Level']:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    # ── Aggregate per Cabang ──
    cabang_agg = df.groupby('Cabang').agg(
        avg_in_stock=('In_Stock_Rate', 'mean'),
        avg_dos=('Days_of_Supply', 'mean'),
        avg_otif=('OTIF_Score', 'mean'),
        total_stock=('Current_Stock', 'sum'),
        avg_rop=('ROP_Level', 'mean'),
        item_count=('Cabang', 'count'),
    ).reset_index()
    
    # Add region
    cabang_agg['Region'] = cabang_agg['Cabang'].map(REGION_MAP).fillna('Lainnya')
    
    branches = []
    alerts = []
    heatmap = []
    
    for _, row in cabang_agg.iterrows():
        cabang = str(row['Cabang'])
        in_stock = float(row['avg_in_stock'])
        dos = float(row['avg_dos'])
        otif = float(row['avg_otif'])
        region = str(row['Region'])
        total_stock = float(row['total_stock'])
        
        # ── Health Score: weighted average ──
        health_score = (in_stock * 0.4) + (min(dos / 30, 1) * 100 * 0.3) + (otif * 0.3)
        health_score = min(health_score, 100)
        
        # ── Zone classification based on DoS ──
        if dos < 3:
            zone = "RED"
            zone_label = "Stockout Risk"
            zone_color = "#ef4444"
        elif dos < 7:
            zone = "YELLOW"
            zone_label = "Warning"
            zone_color = "#f59e0b"
        elif dos <= 30:
            zone = "GREEN"
            zone_label = "Safe"
            zone_color = "#22c55e"
        else:
            zone = "BLUE"
            zone_label = "Overstock"
            zone_color = "#3b82f6"
        
        branch_data = {
            "cabang": cabang,
            "region": region,
            "in_stock_rate": _safe_float(in_stock),
            "days_of_supply": _safe_float(dos),
            "otif_score": _safe_float(otif),
            "health_score": _safe_float(health_score),
            "total_stock": _safe_float(total_stock),
            "item_count": int(row['item_count']),
            "zone": zone,
            "zone_label": zone_label,
            "zone_color": zone_color,
        }
        branches.append(branch_data)
        
        heatmap.append({
            "cabang": cabang,
            "region": region,
            "dos": _safe_float(dos),
            "zone": zone,
            "zone_color": zone_color,
            "health_score": _safe_float(health_score),
        })
        
        # ── Generate alerts ──
        if zone == "RED":
            alerts.append({
                "cabang": cabang,
                "region": region,
                "type": "STOCKOUT_RISK",
                "severity": "CRITICAL",
                "message": f"🔴 Cabang {cabang} sisa stok {_safe_float(dos)} hari. Segera kirim barang!",
                "dos": _safe_float(dos),
                "health_score": _safe_float(health_score),
            })
        elif zone == "YELLOW":
            alerts.append({
                "cabang": cabang,
                "region": region,
                "type": "LOW_STOCK",
                "severity": "WARNING",
                "message": f"🟡 Cabang {cabang} stok tinggal {_safe_float(dos)} hari. Monitor ketat.",
                "dos": _safe_float(dos),
                "health_score": _safe_float(health_score),
            })
        
        if in_stock < 80:
            alerts.append({
                "cabang": cabang,
                "region": region,
                "type": "LOW_FILL_RATE",
                "severity": "WARNING",
                "message": f"📉 In-Stock Rate cabang {cabang} hanya {_safe_float(in_stock)}% (target >90%).",
                "dos": _safe_float(dos),
                "health_score": _safe_float(health_score),
            })
        
        if otif < 75:
            alerts.append({
                "cabang": cabang,
                "region": region,
                "type": "LOW_OTIF",
                "severity": "WARNING",
                "message": f"📦 OTIF cabang {cabang} hanya {_safe_float(otif)}% (target >85%).",
                "dos": _safe_float(dos),
                "health_score": _safe_float(health_score),
            })
    
    # ── Region summary ──
    region_summary = []
    region_agg = cabang_agg.groupby('Region').agg(
        avg_in_stock=('avg_in_stock', 'mean'),
        avg_dos=('avg_dos', 'mean'),
        avg_otif=('avg_otif', 'mean'),
        branch_count=('Cabang', 'count'),
    ).reset_index()
    
    for _, row in region_agg.iterrows():
        health = float(row['avg_in_stock']) * 0.4 + min(float(row['avg_dos']) / 30, 1) * 100 * 0.3 + float(row['avg_otif']) * 0.3
        region_summary.append({
            "region": str(row['Region']),
            "avg_in_stock": _safe_float(row['avg_in_stock']),
            "avg_dos": _safe_float(row['avg_dos']),
            "avg_otif": _safe_float(row['avg_otif']),
            "branch_count": int(row['branch_count']),
            "health_score": _safe_float(min(health, 100)),
        })
    
    # ── DDMRP Zone distribution ──
    zone_counts = {"RED": 0, "YELLOW": 0, "GREEN": 0, "BLUE": 0}
    for b in branches:
        zone_counts[b['zone']] += 1
    
    ddmrp_distribution = [
        {"zone": "Red (Stockout)", "count": zone_counts["RED"], "color": "#ef4444"},
        {"zone": "Yellow (Warning)", "count": zone_counts["YELLOW"], "color": "#f59e0b"},
        {"zone": "Green (Safe)", "count": zone_counts["GREEN"], "color": "#22c55e"},
        {"zone": "Blue (Overstock)", "count": zone_counts["BLUE"], "color": "#3b82f6"},
    ]
    
    # ── Weekly action summary ──
    actions = []
    critical_branches = [b for b in branches if b['zone'] == 'RED']
    warning_branches = [b for b in branches if b['zone'] == 'YELLOW']
    overstock_branches = [b for b in branches if b['zone'] == 'BLUE']
    
    if critical_branches:
        names = ', '.join(b['cabang'] for b in critical_branches[:5])
        actions.append(f"🚨 PRIORITAS 1: Kirim stok segera ke {names}. Sisa stok < 3 hari.")
    if warning_branches:
        names = ', '.join(b['cabang'] for b in warning_branches[:5])
        actions.append(f"⚠️ PRIORITAS 2: Monitor ketat {names}. Sisa stok 3-7 hari.")
    if overstock_branches:
        names = ', '.join(b['cabang'] for b in overstock_branches[:5])
        actions.append(f"📦 OPTIMASI: Pertimbangkan redistribusi dari {names} (overstock > 30 hari).")
    
    avg_health_all = np.mean([b['health_score'] for b in branches]) if branches else 0
    
    return {
        'branches': sorted(branches, key=lambda x: x['health_score']),
        'alerts': sorted(alerts, key=lambda x: x['dos']),
        'heatmap': sorted(heatmap, key=lambda x: x['dos']),
        'region_summary': region_summary,
        'ddmrp_distribution': ddmrp_distribution,
        'weekly_actions': actions,
        'kpi': {
            'total_branches': len(branches),
            'avg_in_stock': _safe_float(np.mean([b['in_stock_rate'] for b in branches]) if branches else 0),
            'avg_dos': _safe_float(np.mean([b['days_of_supply'] for b in branches]) if branches else 0),
            'avg_otif': _safe_float(np.mean([b['otif_score'] for b in branches]) if branches else 0),
            'avg_health': _safe_float(avg_health_all),
            'critical_count': zone_counts['RED'],
            'warning_count': zone_counts['YELLOW'],
            'safe_count': zone_counts['GREEN'],
            'overstock_count': zone_counts['BLUE'],
            'alert_count': len(alerts),
        },
        'analysis_date': datetime.now().strftime("%Y-%m-%d %H:%M"),
    }
