"""
DDMRP (Demand Driven MRP) Engine
=================================
Implements the full DDMRP methodology:
  1. ADU  — Average Daily Usage
  2. CoV  — Coefficient of Variation  = σ / μ
  3. Variability Factor — mapping CoV → multiplier
  4. Lead Time Factor   — mapping DLT → multiplier
  5. Buffer Zones       — Red / Yellow / Green
  6. Net Flow Equation  — On-hand + On-order − Qualified Demand
  7. Replenishment decision

References (ScienceDirect & literatur terkait, 2020-2026):
  - Dynamic buffer sizing with ML  (2023-2025 trend)
  - Reinforcement learning for smart replenishment
  - Classic DDMRP: Ptak & Smith, "Demand Driven MRP"
"""

import math
import numpy as np
import pandas as pd
from typing import Optional


# ══════════════════════════════════════════════════════════════
#  1. CORE METRICS
# ══════════════════════════════════════════════════════════════

def calc_adu(sales: list[float], period_days: int = 30) -> float:
    """
    Average Daily Usage (ADU)
    ─────────────────────────
    ADU = Σ(sales) / total_days

    Args:
        sales: list of periodic sales figures
        period_days: how many days each period covers (default 30 = monthly)
    Returns:
        ADU in units/day
    """
    total_units = sum(sales)
    total_days = len(sales) * period_days
    if total_days == 0:
        return 0.0
    return total_units / total_days


def calc_cov(values: list[float]) -> float:
    """
    Coefficient of Variation (CoV)
    ───────────────────────────────
    CoV = σ / μ

    where σ = standard deviation, μ = mean
    A higher CoV indicates more demand variability.
    """
    arr = np.array(values, dtype=float)
    mu = np.mean(arr)
    if mu == 0:
        return 0.0
    sigma = np.std(arr, ddof=0)
    return float(sigma / mu)


def classify_variability_factor(
    cov: float,
    low_thresh: float = 0.25,
    high_thresh: float = 0.50,
) -> dict:
    """
    Variability Factor (VF) — maps CoV to a buffer multiplier.
    ────────────────────────────────────────────────────────────
    - CoV ≤ low_thresh   → Low variability    → VF small  (e.g. 0.30)
    - low < CoV ≤ high   → Medium variability → VF medium (e.g. 0.50)
    - CoV > high_thresh   → High variability   → VF large  (e.g. 0.75)

    Returns dict with 'category', 'factor', 'cov'
    """
    if cov <= low_thresh:
        return {"category": "Low", "factor": 0.30, "cov": round(cov, 4)}
    elif cov <= high_thresh:
        return {"category": "Medium", "factor": 0.50, "cov": round(cov, 4)}
    else:
        return {"category": "High", "factor": 0.75, "cov": round(cov, 4)}


def classify_lead_time_factor(
    dlt_days: float,
    short_thresh: int = 7,
    long_thresh: int = 21,
) -> dict:
    """
    Lead Time Factor (LTF) — maps Decoupled Lead Time to a multiplier.
    ────────────────────────────────────────────────────────────────────
    - DLT ≤ short  → Short lead time → LTF larger  (0.50)
    - short < DLT ≤ long → Medium       → LTF medium (0.35)
    - DLT > long   → Long lead time  → LTF smaller (0.20)

    Longer lead times get a *smaller* factor because the red zone base
    already scales linearly with DLT.
    """
    if dlt_days <= short_thresh:
        return {"category": "Short", "factor": 0.50, "dlt_days": dlt_days}
    elif dlt_days <= long_thresh:
        return {"category": "Medium", "factor": 0.35, "dlt_days": dlt_days}
    else:
        return {"category": "Long", "factor": 0.20, "dlt_days": dlt_days}


# ══════════════════════════════════════════════════════════════
#  2. BUFFER ZONES
# ══════════════════════════════════════════════════════════════

def calc_buffer_zones(
    adu: float,
    dlt_days: float,
    lead_time_factor: float,
    variability_factor: float,
    moq: float = 1.0,
    order_cycle_days: float = 1.0,
    trend_multiplier: float = 1.0,
) -> dict:
    """
    DDMRP Buffer Zones
    ═══════════════════
    Red Zone:
        Red Base   = ADU × DLT × Lead Time Factor
        Red Safety = Red Base × Variability Factor × Trend Multiplier
        Red Zone   = Red Base + Red Safety

    Green Zone:
        Green Zone = max(ADU × DLT × LTF, ADU × order_cycle, MOQ)

    Yellow Zone:
        Yellow Zone = ADU × DLT

    Thresholds:
        Top of Red    (TOR) = Red Zone
        Top of Yellow (TOY) = Red Zone + Yellow Zone
        Top of Green  (TOG) = Red Zone + Yellow Zone + Green Zone
    """
    # Red Zone
    red_base = adu * dlt_days * lead_time_factor
    red_safety = red_base * variability_factor * trend_multiplier
    red_zone = red_base + red_safety

    # Green Zone
    green_zone = max(
        adu * dlt_days * lead_time_factor,
        adu * order_cycle_days,
        moq,
    )

    # Yellow Zone
    yellow_zone = adu * dlt_days

    # Thresholds
    tor = red_zone
    toy = red_zone + yellow_zone
    tog = red_zone + yellow_zone + green_zone

    return {
        "red_base": round(red_base, 2),
        "red_safety": round(red_safety, 2),
        "red_zone": round(red_zone, 2),
        "yellow_zone": round(yellow_zone, 2),
        "green_zone": round(green_zone, 2),
        "top_of_red": round(tor, 2),
        "top_of_yellow": round(toy, 2),
        "top_of_green": round(tog, 2),
    }


# ══════════════════════════════════════════════════════════════
#  3. NET FLOW EQUATION & REPLENISHMENT
# ══════════════════════════════════════════════════════════════

def calc_net_flow_position(
    on_hand: float,
    on_order: float,
    qualified_demand: float,
) -> float:
    """
    Net Flow Position (NFP)
    ═══════════════════════
    NFP = On-hand + On-order − Qualified Sales Order Demand
    """
    return on_hand + on_order - qualified_demand


def replenishment_decision(
    nfp: float,
    top_of_yellow: float,
    top_of_green: float,
    top_of_red: float,
) -> dict:
    """
    Replenishment Decision
    ══════════════════════
    - If NFP ≥ TOY → No order needed (position in Green/Yellow zone)
    - If TOR ≤ NFP < TOY → Order recommended. Qty = TOG − NFP
    - If NFP < TOR → URGENT order. Qty = TOG − NFP (expedite)
    """
    if nfp >= top_of_yellow:
        return {
            "action": "NO_ORDER",
            "zone": "Green/Upper Yellow",
            "status": "OK",
            "suggested_order_qty": 0,
            "urgency": "none",
            "description": "Posisi stok aman — tidak perlu order.",
        }
    elif nfp >= top_of_red:
        order_qty = max(0, top_of_green - nfp)
        return {
            "action": "ORDER",
            "zone": "Yellow/Lower Yellow",
            "status": "ORDER_RECOMMENDED",
            "suggested_order_qty": round(order_qty, 2),
            "urgency": "normal",
            "description": f"NFP masuk zona kuning — order {order_qty:.0f} unit untuk kembali ke TOG.",
        }
    else:
        order_qty = max(0, top_of_green - nfp)
        return {
            "action": "URGENT_ORDER",
            "zone": "Red",
            "status": "CRITICAL",
            "suggested_order_qty": round(order_qty, 2),
            "urgency": "high",
            "description": f"NFP masuk zona MERAH — SEGERA order {order_qty:.0f} unit!",
        }


# ══════════════════════════════════════════════════════════════
#  4. MANUAL ANALYSIS (single SKU)
# ══════════════════════════════════════════════════════════════

def analyze_ddmrp_manual(params: dict) -> dict:
    """
    Run DDMRP analysis from manual form input.

    Expected params:
        adu: float               — Average Daily Usage
        dlt_days: float           — Decoupled Lead Time in days
        moq: float (optional)    — Minimum Order Quantity
        order_cycle_days: float  — Order cycle in days
        on_hand: float           — Current on-hand inventory
        on_order: float          — Open purchase orders
        qualified_demand: float  — Qualified sales order demand
        cov_override: float      — Optional manual CoV (if no history)
    """
    adu = float(params.get("adu", 0))
    dlt_days = float(params.get("dlt_days", 14))
    moq = float(params.get("moq", 1))
    order_cycle_days = float(params.get("order_cycle_days", 7))
    on_hand = float(params.get("on_hand", 0))
    on_order = float(params.get("on_order", 0))
    qualified_demand = float(params.get("qualified_demand", 0))
    cov_override = float(params.get("cov_override", 0.40))

    # Factors
    vf_info = classify_variability_factor(cov_override)
    ltf_info = classify_lead_time_factor(dlt_days)

    # Buffer zones
    buffer = calc_buffer_zones(
        adu=adu,
        dlt_days=dlt_days,
        lead_time_factor=ltf_info["factor"],
        variability_factor=vf_info["factor"],
        moq=moq,
        order_cycle_days=order_cycle_days,
    )

    # Net flow
    nfp = calc_net_flow_position(on_hand, on_order, qualified_demand)

    # Decision
    decision = replenishment_decision(
        nfp=nfp,
        top_of_yellow=buffer["top_of_yellow"],
        top_of_green=buffer["top_of_green"],
        top_of_red=buffer["top_of_red"],
    )

    return {
        "adu": round(adu, 4),
        "cov": round(cov_override, 4),
        "variability": vf_info,
        "lead_time": ltf_info,
        "buffer_zones": buffer,
        "net_flow_position": round(nfp, 2),
        "on_hand": on_hand,
        "on_order": on_order,
        "qualified_demand": qualified_demand,
        "replenishment": decision,
    }


# ══════════════════════════════════════════════════════════════
#  5. FILE-BASED ANALYSIS (multi-SKU)
# ══════════════════════════════════════════════════════════════

def _safe_float(v) -> float:
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except Exception:
        return 0.0


def analyze_ddmrp_from_file(
    df: pd.DataFrame,
    dlt_days: float = 14,
    moq: float = 1,
    order_cycle_days: float = 7,
    default_on_hand: float = 0,
    default_on_order: float = 0,
    default_qualified_demand: float = 0,
) -> dict:
    """
    Run DDMRP analysis from uploaded sales data file.

    Expected DataFrame columns:
        - Bulan (date) or Date
        - Penjualan (sales) or Sales
        - Optional: SKU / Produk, Cabang
        - Optional: On-Hand, On-Order, Qualified Demand
    """
    col_map = {}
    for c in df.columns:
        cl = str(c).strip().lower()
        if cl in ("sku", "item", "product", "nama barang"):
            col_map[c] = "sku"
        elif cl in ("cabang", "nama cabang", "branch", "lokasi"):
            col_map[c] = "cabang"
        elif cl in ("kategori", "category", "category product", "jenis"):
            col_map[c] = "category"
        elif cl in ("date", "tanggal", "waktu", "bulan"):
            col_map[c] = "date"
        elif cl in ("sales", "penjualan", "qty", "demand"):
            col_map[c] = "sales"
        elif cl in ("on_hand", "on hand", "stok", "inventory", "on-hand"):
            col_map[c] = "on_hand"
        elif cl in ("on_order", "on order", "pesanan", "on-order"):
            col_map[c] = "on_order"
        elif cl in ("qualified_demand", "qualified demand", "kebutuhan"):
            col_map[c] = "qualified_demand"
        elif cl in ("lead time", "lead time (hari)", "dlt"):
            col_map[c] = "dlt"
        elif cl in ("moq", "moq (unit)"):
            col_map[c] = "moq"
        elif cl in ("order cycle", "order cycle (hari)", "oc"):
            col_map[c] = "oc"

    df = df.rename(columns=col_map)

    if "sales" not in df.columns:
        return {"error": "Kolom 'Penjualan' atau 'Sales' tidak ditemukan."}

    df["sales"] = df["sales"].apply(_safe_float)

    # Group by available metadata columns
    group_cols = []
    if "sku" in df.columns:
        group_cols.append("sku")
    if "cabang" in df.columns:
        group_cols.append("cabang")
    if "category" in df.columns:
        group_cols.append("category")

    results = []

    if group_cols:
        groups = df.groupby(group_cols)
    else:
        groups = [("All", df)]

    try:
        from .forecast_engine import _gb_forecast
    except ImportError:
        def _gb_forecast(y, steps):
            return [np.mean(y[-30:])]*steps if len(y)>=30 else [np.mean(y)]*steps

    for group_key, group_df in groups:
        if isinstance(group_key, str):
            label = group_key
        else:
            label = " — ".join(str(k) for k in group_key)

        sales_list = group_df["sales"].tolist()
        if len(sales_list) < 2:
            continue
            
        # Get latest inventory data if available
        on_hand = _safe_float(group_df.iloc[-1]["on_hand"]) if "on_hand" in group_df.columns else default_on_hand
        on_order = _safe_float(group_df.iloc[-1]["on_order"]) if "on_order" in group_df.columns else default_on_order
        qualified_demand = _safe_float(group_df.iloc[-1]["qualified_demand"]) if "qualified_demand" in group_df.columns else default_qualified_demand
        
        # Get dynamic DDMRP parameters if available
        dlt_val = _safe_float(group_df.iloc[-1]["dlt"]) if "dlt" in group_df.columns else dlt_days
        moq_val = _safe_float(group_df.iloc[-1]["moq"]) if "moq" in group_df.columns else moq
        oc_val = _safe_float(group_df.iloc[-1]["oc"]) if "oc" in group_df.columns else order_cycle_days

        # Standard ADU vs XGBoost ADU
        adu = calc_adu(sales_list, period_days=30)
        
        xgb_preds = _gb_forecast(sales_list, 30)
        xgb_adu = float(np.mean(xgb_preds)) if xgb_preds else adu
        
        # Use XGBoost ADU if it's reasonable, otherwise fallback to historical ADU
        final_adu = xgb_adu if xgb_adu > 0 else adu

        cov = calc_cov(sales_list)
        vf_info = classify_variability_factor(cov)
        ltf_info = classify_lead_time_factor(dlt_val)
        
        # Trend Multiplier Calculation (ML inspired dynamic buffer)
        # If last 7 days average is > 20% higher than last 30 days average, boost buffer
        trend_multiplier = 1.0
        if len(sales_list) >= 30:
            trend_7d = np.mean(sales_list[-7:])
            trend_30d = np.mean(sales_list[-30:])
            if trend_30d > 0 and trend_7d > (1.2 * trend_30d):
                trend_multiplier = 1.25 # 25% boost to Red Safety
        
        buffer = calc_buffer_zones(
            adu=final_adu,
            dlt_days=dlt_val,
            lead_time_factor=ltf_info["factor"],
            variability_factor=vf_info["factor"],
            moq=moq_val,
            order_cycle_days=oc_val,
            trend_multiplier=trend_multiplier,
        )

        nfp = calc_net_flow_position(on_hand, on_order, qualified_demand)

        decision = replenishment_decision(
            nfp=nfp,
            top_of_yellow=buffer["top_of_yellow"],
            top_of_green=buffer["top_of_green"],
            top_of_red=buffer["top_of_red"],
        )

        cabang = str(group_key[group_cols.index("cabang")]) if "cabang" in group_cols and isinstance(group_key, tuple) else (group_key if "cabang" in group_cols else "All")
        kategori = str(group_key[group_cols.index("category")]) if "category" in group_cols and isinstance(group_key, tuple) else (group_key if "category" in group_cols else "All")

        results.append({
            "label": label,
            "cabang": cabang,
            "kategori": kategori,
            "adu": round(final_adu, 4),
            "historical_adu": round(adu, 4),
            "xgb_adu": round(xgb_adu, 4),
            "cov": round(cov, 4),
            "variability": vf_info,
            "lead_time": ltf_info,
            "buffer_zones": buffer,
            "net_flow_position": round(nfp, 2),
            "replenishment": decision,
            "sales_history": [round(s, 2) for s in sales_list[-12:]],
            "stats": {
                "mean": round(float(np.mean(sales_list)), 2),
                "std": round(float(np.std(sales_list)), 2),
                "min": round(float(np.min(sales_list)), 2),
                "max": round(float(np.max(sales_list)), 2),
                "n_periods": len(sales_list),
            },
        })

    if not results:
        return {"error": "Data tidak cukup untuk analisis DDMRP."}

    # Summary
    avg_adu = np.mean([r["adu"] for r in results])
    avg_cov = np.mean([r["cov"] for r in results])
    urgent_count = sum(1 for r in results if r["replenishment"]["urgency"] == "high")
    order_count = sum(1 for r in results if r["replenishment"]["urgency"] == "normal")

    insights = [
        f"Total {len(results)} SKU/grup berhasil dianalisis.",
        f"Rata-rata ADU: {avg_adu:.2f} unit/hari.",
        f"Rata-rata CoV: {avg_cov:.2f} — {'High variability' if avg_cov > 0.5 else 'Moderate variability' if avg_cov > 0.25 else 'Low variability'}.",
    ]
    if urgent_count > 0:
        insights.append(f"⚠️ {urgent_count} SKU dalam zona MERAH — perlu order segera!")
    if order_count > 0:
        insights.append(f"📦 {order_count} SKU perlu replenishment order.")

    return {
        "results": results,
        "summary": {
            "total_skus": len(results),
            "avg_adu": round(avg_adu, 4),
            "avg_cov": round(avg_cov, 4),
            "urgent_orders": urgent_count,
            "normal_orders": order_count,
            "no_orders": len(results) - urgent_count - order_count,
        },
        "insights": insights,
    }
