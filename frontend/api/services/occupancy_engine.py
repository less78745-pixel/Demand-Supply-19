import os
import io
import math
import base64
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

from openpyxl import load_workbook, Workbook
from openpyxl.utils import get_column_letter
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.worksheet import Worksheet

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

def _safe_float(v):
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except Exception:
        return 0.0

# ============================================================================
# CORE MRP LOGIC (Sheet Raw & WH, Week Awal, Periode Dinamis)
# ============================================================================

FIXED_RAW_COLS = 4
ONHAND_COL = 5
FIRST_WEEK_BLOCK_COL = 6
COLS_PER_WEEK = 4

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
          "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
WEEKS_PER_MONTH = 4

def period_label(week_number: int) -> str:
    from datetime import date
    if week_number < 1:
        week_number = 1
    
    # Calculate year and ISO week
    # Assuming base year 2024 (leap year, standard reference)
    year = 2024 + (week_number - 1) // 52
    iso_week = ((week_number - 1) % 52) + 1
    
    # Get the date of Monday for this ISO week
    try:
        d = date.fromisocalendar(year, iso_week, 1)
    except Exception:
        # Fallback if fromisocalendar is not available or errors out
        d = date(year, 1, 1)
        
    month_name = MONTHS[d.month - 1]
    
    # Calculate week of the month (1 to 5)
    week_in_month = (d.day - 1) // 7 + 1
    
    label = f"{month_name}-{week_in_month}"
    year_offset = year - 2024
    if year_offset > 0:
        label += f" (Y+{year_offset})"
    return label

def read_week_awal(ws_wh: Worksheet, default: int = 1) -> int:
    for row in ws_wh.iter_rows(values_only=True):
        for i, val in enumerate(row):
            if isinstance(val, str) and val.strip().lower() == "week awal":
                if i + 1 < len(row) and isinstance(row[i + 1], (int, float)):
                    return int(row[i + 1])
    return default

def detect_week_count(ws_raw: Worksheet) -> int:
    max_col = ws_raw.max_column
    remaining = max_col - (FIRST_WEEK_BLOCK_COL - 1)
    n_weeks = remaining // COLS_PER_WEEK
    return max(1, n_weeks)

def raw_week_cols(w: int):
    base = FIRST_WEEK_BLOCK_COL + COLS_PER_WEEK * w
    return base, base + 1, base + 2, base + 3

def get_raw_rows(ws_raw: Worksheet):
    rows = []
    for idx, row in enumerate(ws_raw.iter_rows(min_row=3, max_col=2, values_only=True), start=3):
        val1 = row[0] if len(row) > 0 else None
        val2 = row[1] if len(row) > 1 else None
        if val1 in (None, "") and val2 in (None, ""):
            continue
        if str(val2).strip().lower() in ("cabang", "branch", "grup"):
            continue
        rows.append(idx)
    return rows

def get_wh_rows(ws_wh: Worksheet):
    rows = []
    for idx, row in enumerate(ws_wh.iter_rows(min_row=2, max_col=2, values_only=True), start=2):
        val1 = row[0] if len(row) > 0 else None
        cabang = row[1] if len(row) > 1 else None
        if val1 in (None, "") or cabang in (None, ""):
            continue
        rows.append(idx)
    return rows

class RawRecord:
    __slots__ = ("no", "cabang", "grup", "category", "onhand", "to", "vessel", "target")

    def __init__(self, no, cabang, grup, category, onhand, to, vessel, target):
        self.no = no
        self.cabang = str(cabang) if cabang is not None else "Unknown"
        self.grup = str(grup) if grup is not None else "General"
        self.category = str(category) if category is not None else "General"
        self.onhand = _safe_float(onhand)
        self.to = [_safe_float(x) for x in to]
        self.vessel = [_safe_float(x) for x in vessel]
        self.target = [_safe_float(x) for x in target]

    @property
    def label(self):
        return f"{self.cabang}-{self.grup}-{self.category}"

def read_raw_records(ws_raw: Worksheet, n_weeks: int):
    records = []
    for row_vals in ws_raw.iter_rows(min_row=3, values_only=True):
        val1 = row_vals[0] if len(row_vals) > 0 else None
        val2 = row_vals[1] if len(row_vals) > 1 else None
        if val1 in (None, "") and val2 in (None, ""):
            continue
        if str(val2).strip().lower() in ("cabang", "branch", "grup"):
            continue

        def get_val(col_idx_1_based):
            idx = col_idx_1_based - 1
            return row_vals[idx] if idx < len(row_vals) and row_vals[idx] is not None else 0

        onhand = get_val(ONHAND_COL)
        to, vessel, target = [], [], []
        for w in range(n_weeks):
            c_to, c_vessel, c_forecast, c_target = raw_week_cols(w)
            to.append(get_val(c_to))
            vessel.append(get_val(c_vessel))
            target.append(get_val(c_target))

        records.append(RawRecord(
            no=val1,
            cabang=val2,
            grup=row_vals[2] if len(row_vals) > 2 else None,
            category=row_vals[3] if len(row_vals) > 3 else None,
            onhand=onhand, to=to, vessel=vessel, target=target,
        ))
    return records

def read_wh_capacity(ws_wh: Worksheet):
    result = []
    for row in ws_wh.iter_rows(min_row=2, max_col=4, values_only=True):
        val = row[0] if len(row) > 0 else None
        cabang = row[1] if len(row) > 1 else None
        if val in (None, "") or cabang in (None, ""):
            continue
        existing = row[2] if len(row) > 2 and row[2] is not None else 0
        tambahan = row[3] if len(row) > 3 and row[3] is not None else 0
        try:
            total_cap = float(existing) + float(tambahan)
        except (ValueError, TypeError):
            total_cap = 0.0
        result.append((str(cabang), total_cap))
    return result

def compute_balance_series(record: RawRecord, n_weeks: int):
    demand = record.target
    balances = []
    prev = 0.0
    for w in range(n_weeks):
        if w == 0:
            bal = record.onhand + record.to[0] + record.vessel[0] - demand[0]
        else:
            bal = prev + record.to[w] + record.vessel[w] - demand[w]
        balances.append(bal)
        prev = bal
    return balances

def compute_ratio_series(balances, record: RawRecord, n_weeks: int):
    demand = record.target
    ratios = []
    for w in range(n_weeks):
        if w + 1 < n_weeks and demand[w + 1]:
            ratios.append(balances[w] / demand[w + 1])
        else:
            ratios.append(None)
    return ratios

def compute_occupancy(records, balances_by_record, wh_capacity):
    if not balances_by_record:
        return {}
    n_weeks = len(next(iter(balances_by_record.values())))
    occupancy = {}
    for cabang, capacity in wh_capacity:
        totals = [0.0] * n_weeks
        for rec in records:
            if rec.cabang == cabang:
                bals = balances_by_record[id(rec)]
                for w in range(n_weeks):
                    # Akurasi: shortage/minus tidak membebaskan ruang fisik gudang
                    totals[w] += max(0.0, bals[w])
        occupancy[cabang] = [t / capacity if capacity else None for t in totals]
    return occupancy

def build_period_labels(week_awal: int, n_weeks: int):
    return [period_label(week_awal + w) for w in range(n_weeks)]

# ============================================================================
# EXCEL SHEET BUILDERS & CHARTS & HTML REPORT
# ============================================================================

FILL_JUDUL = PatternFill("solid", fgColor="D9D9D9")
FILL_PERHITUNGAN = PatternFill("solid", fgColor="FCE4D6")
FILL_RATIO = PatternFill("solid", fgColor="CFE2F3")
FILL_HEADER2 = PatternFill("solid", fgColor="F2F2F2")
BOLD = Font(bold=True)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)

def style_header_cell(ws, row, col, text, fill=None):
    c = ws.cell(row=row, column=col, value=text)
    c.font = BOLD
    c.alignment = CENTER
    c.border = BORDER
    if fill:
        c.fill = fill
    return c

def build_hasil_sheet(wb, sheet_name, ws_raw, raw_rows, n_weeks, period_labels):
    if sheet_name in wb.sheetnames:
        del wb[sheet_name]
    ws = wb.create_sheet(sheet_name)
    col_perhitungan_start = FIXED_RAW_COLS + 1
    col_ratio_start = col_perhitungan_start + n_weeks
    total_cols = col_ratio_start + n_weeks - 1

    for c in range(1, FIXED_RAW_COLS + 1):
        style_header_cell(ws, 1, c, "Judul", FILL_JUDUL)
    for w in range(n_weeks):
        style_header_cell(ws, 1, col_perhitungan_start + w, "Perhitungan", FILL_PERHITUNGAN)
    for w in range(n_weeks):
        style_header_cell(ws, 1, col_ratio_start + w, "Ratio", FILL_RATIO)

    fixed_titles = ["No", "Cabang", "Grup", "Category"]
    for i, t in enumerate(fixed_titles, start=1):
        style_header_cell(ws, 2, i, t, FILL_HEADER2)
    for w in range(n_weeks):
        style_header_cell(ws, 2, col_perhitungan_start + w, period_labels[w], FILL_HEADER2)
    for w in range(n_weeks):
        style_header_cell(ws, 2, col_ratio_start + w, period_labels[w], FILL_HEADER2)

    perhitungan_col_letters = [get_column_letter(col_perhitungan_start + w) for w in range(n_weeks)]
    raw_col_letters = []
    for w in range(n_weeks):
        col_to, col_vessel, col_forecast, col_target = raw_week_cols(w)
        raw_col_letters.append({
            "to": get_column_letter(col_to),
            "vessel": get_column_letter(col_vessel),
            "demand": get_column_letter(col_target)
        })

    out_row = 3
    for raw_row in raw_rows:
        row_vals = [f"=Raw!A{raw_row}", f"=Raw!B{raw_row}", f"=Raw!C{raw_row}", f"=Raw!D{raw_row}"]
        for w in range(n_weeks):
            L_to = raw_col_letters[w]["to"]
            L_vessel = raw_col_letters[w]["vessel"]
            L_demand = raw_col_letters[w]["demand"]
            if w == 0:
                formula = f"=SUM(Raw!E{raw_row},Raw!{L_to}{raw_row},Raw!{L_vessel}{raw_row})-Raw!{L_demand}{raw_row}"
            else:
                prev_letter = perhitungan_col_letters[w - 1]
                formula = f"=SUM({prev_letter}{out_row},Raw!{L_to}{raw_row},Raw!{L_vessel}{raw_row})-Raw!{L_demand}{raw_row}"
            row_vals.append(formula)

        for w in range(n_weeks):
            if w + 1 < n_weeks:
                perhitungan_letter = perhitungan_col_letters[w]
                L_demand_next = raw_col_letters[w + 1]["demand"]
                formula = f'=IFERROR(IF(OR(Raw!{L_demand_next}{raw_row}="",Raw!{L_demand_next}{raw_row}=0),"",{perhitungan_letter}{out_row}/Raw!{L_demand_next}{raw_row}),"")'
                row_vals.append(formula)
            else:
                row_vals.append(None)
        ws.append(row_vals)
        for w in range(n_weeks):
            if w + 1 < n_weeks:
                if out_row <= 100:
                    ws.cell(row=out_row, column=col_ratio_start + w).number_format = "0.0%"
        out_row += 1

    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 15
    ws.column_dimensions["C"].width = 14
    ws.column_dimensions["D"].width = 16
    for c in range(col_perhitungan_start, total_cols + 1):
        ws.column_dimensions[get_column_letter(c)].width = 12

    ws.freeze_panes = "E3"
    ws.views.sheetView[0].showGridLines = True
    return ws, col_perhitungan_start, out_row - 1

def build_occupancy_sheet(wb, sheet_name, ws_wh, wh_rows, hasil_sheet_name,
                            perhitungan_col_start, n_weeks, hasil_last_row, period_labels):
    if sheet_name in wb.sheetnames:
        del wb[sheet_name]
    ws = wb.create_sheet(sheet_name)
    titles = ["No", "Cabang"] + period_labels
    for i, t in enumerate(titles, start=1):
        style_header_cell(ws, 1, i, t, FILL_HEADER2)
    out_row = 2
    perhitungan_col_letters = [get_column_letter(perhitungan_col_start + w) for w in range(n_weeks)]
    for wh_row in wh_rows:
        row_vals = [f"=WH!A{wh_row}", f"=WH!B{wh_row}"]
        for w in range(n_weeks):
            col_letter = perhitungan_col_letters[w]
            formula = f"=IFERROR(IF(WH!$E{wh_row}=0,0,SUMIF('{hasil_sheet_name}'!$B$3:$B${hasil_last_row},$B{out_row},'{hasil_sheet_name}'!${col_letter}$3:${col_letter}${hasil_last_row})/WH!$E{wh_row}),0)"
            row_vals.append(formula)
        ws.append(row_vals)
        for w in range(n_weeks):
            ws.cell(row=out_row, column=3 + w).number_format = "0.0%"
        out_row += 1

    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 16
    for w in range(n_weeks):
        ws.column_dimensions[get_column_letter(3 + w)].width = 13

    ws.freeze_panes = "C2"
    ws.views.sheetView[0].showGridLines = True
    return ws

def generate_excel_workbook(wb: Workbook):
    ws_raw, ws_wh = wb["Raw"], wb["WH"]
    n_weeks = detect_week_count(ws_raw)
    raw_rows, wh_rows = get_raw_rows(ws_raw), get_wh_rows(ws_wh)
    week_awal = read_week_awal(ws_wh, default=1)
    period_labels = build_period_labels(week_awal, n_weeks)

    for r in wh_rows:
        ws_wh.cell(row=r, column=5, value=f"=C{r}+D{r}")

        _, ht_start, ht_last = build_hasil_sheet(wb, "Hasil Target", ws_raw, raw_rows, n_weeks, period_labels)
        build_occupancy_sheet(wb, "Occupancy Target", ws_wh, wh_rows, "Hasil Target", ht_start, n_weeks, ht_last, period_labels)

    order = ["Raw", "WH", "Harga Container", "Hasil Target", "Occupancy Target", "Sheet Hasil"]
    wb._sheets.sort(key=lambda s: order.index(s.title) if s.title in order else 999)
    return wb, period_labels, week_awal, n_weeks

CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]
SURFACE, INK_PRIMARY, INK_SECONDARY, INK_MUTED, GRIDLINE, BASELINE, STATUS_CRITICAL = "#fcfcfb", "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#d03b3b"

def _style_axes(ax):
    ax.grid(axis="y", which="major")
    ax.grid(axis="x", visible=False)
    ax.spines["left"].set_color(BASELINE)
    ax.spines["bottom"].set_color(BASELINE)

def plot_balance_chart_b64(records, balances_by_record, period_labels, title):
    fig, ax = plt.subplots(figsize=(9.5, 5))
    _style_axes(ax)
    
    # A.1: Group by Cabang & Grup
    agg_bals = {}
    for rec in records:
        group_key = f"{rec.cabang}-{rec.grup}"
        if group_key not in agg_bals:
            agg_bals[group_key] = [0.0] * len(period_labels)
        bals = balances_by_record[id(rec)]
        for w in range(len(period_labels)):
            agg_bals[group_key][w] += bals[w]
            
    plot_keys = list(agg_bals.keys())[:15] if len(agg_bals) > 15 else list(agg_bals.keys())
    for i, key in enumerate(plot_keys):
        ax.plot(period_labels, agg_bals[key], marker="o", markersize=5, linewidth=2, color=CATEGORICAL[i % len(CATEGORICAL)], label=key)
    ax.axhline(0, color=STATUS_CRITICAL, linewidth=1, linestyle="--", alpha=0.6)
    ax.set_ylabel("Balance (unit)")
    ax.set_title(title, fontsize=13, fontweight="bold", color=INK_PRIMARY, loc="left")
    ax.legend(loc="upper left", bbox_to_anchor=(1.0, 1.0), frameon=False, fontsize=9)
    fig.subplots_adjust(right=0.78)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, facecolor=SURFACE)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")

def plot_occupancy_chart_b64(occupancy, period_labels, title):
    fig, ax = plt.subplots(figsize=(8.5, 5))
    _style_axes(ax)
    for i, cabang in enumerate(occupancy.keys()):
        y = [v * 100 if v is not None else None for v in occupancy[cabang]]
        ax.plot(period_labels, y, marker="o", markersize=6, linewidth=2.2, color=CATEGORICAL[i % len(CATEGORICAL)], label=cabang)
    ax.axhline(100, color=STATUS_CRITICAL, linewidth=1.4, linestyle="--")
    ax.text(0.01, 100, " Kapasitas 100% ", color=STATUS_CRITICAL, fontsize=9, va="bottom", ha="left", transform=ax.get_yaxis_transform())
    ax.yaxis.set_major_formatter(mticker.PercentFormatter())
    ax.set_ylabel("Occupancy (%)")
    ax.set_title(title, fontsize=13, fontweight="bold", color=INK_PRIMARY, loc="left")
    ax.legend(loc="upper left", bbox_to_anchor=(1.0, 1.0), frameon=False, fontsize=9)
    fig.subplots_adjust(right=0.8)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, facecolor=SURFACE)
    plt.close(fig)
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("ascii")

def generate_insights(records, bal_t, ratio_t, occ_t, period_labels, n_weeks):
    insights = []
    for rec in records:
        for w, r in enumerate(ratio_t[id(rec)]):
            if r is not None and r < 1:
                insights.append(f"RISIKO KEKURANGAN (Target) - {rec.label}: pada periode {period_labels[w]}, balance hanya {r*100:.0f}% dari target periode {period_labels[w+1]}.")
    for cabang, series in occ_t.items():
        for w, v in enumerate(series):
            if v is not None and v > 1:
                insights.append(f"RISIKO OVER KAPASITAS GUDANG (Target) - Cabang {cabang} pada periode {period_labels[w]}: occupancy {v*100:.0f}% dari kapasitas gudang.")
    for rec in records:
        yt = bal_t[id(rec)]
        delta = yt[-1] - yt[0]
        pct = (delta / abs(yt[0]) * 100) if yt[0] else None
        arah = "naik" if delta > 0 else ("turun" if delta < 0 else "stabil")
        if pct is not None and abs(pct) >= 30:
            insights.append(f"TREN - {rec.label} (Target): balance {arah} signifikan dari {yt[0]:.1f} ({period_labels[0]}) menjadi {yt[-1]:.1f} ({period_labels[-1]}), perubahan {pct:+.0f}%. " + ("Cek risiko overstock." if delta > 0 else "Cek risiko kekurangan stok."))
    if not insights:
        insights.append("Tidak ditemukan indikasi risiko kekurangan stok atau over-kapasitas gudang pada rentang periode yang dianalisis.")
    return insights[:50]

def build_html_report_string(charts_data, insights, period_labels, week_awal):
    imgs_html = "".join(f'<div class="chart"><h3>{title}</h3><img src="data:image/png;base64,{b64}" alt="{title}"/></div>' for title, b64 in charts_data)
    insight_items = "".join(f"<li>{i}</li>" for i in insights)
    return f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<title>MRP Analysis Report</title>
<style>
  body {{ font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background:#f9f9f7; color:#0b0b0b; margin:0; padding:32px; }}
  h1 {{ font-size: 22px; margin-bottom:4px; }}
  .sub {{ color:#52514e; margin-bottom:28px; }}
  .chart {{ background:#fcfcfb; border:1px solid #e1e0d9; border-radius:10px; padding:16px; margin-bottom:24px; }}
  .chart h3 {{ margin-top:0; font-size:15px; }}
  .chart img {{ max-width:100%; display:block; }}
  .insights {{ background:#fcfcfb; border:1px solid #e1e0d9; border-radius:10px; padding:20px 28px; }}
  .insights li {{ margin-bottom:10px; line-height:1.5; }}
  .grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:20px; }}
  @media (max-width: 900px) {{ .grid {{ grid-template-columns: 1fr; }} }}
</style>
</head>
<body>
  <h1>MRP Balance &amp; Occupancy - Analysis Report</h1>
  <div class="sub">Periode: {period_labels[0]} - {period_labels[-1]} (Week Awal = {week_awal})</div>
  <div class="grid">{imgs_html}</div>
  <h2>Insight &amp; Rekomendasi</h2>
  <div class="insights"><ul>{insight_items}</ul></div>
</body>
</html>"""

def calculate_mrp_occupancy_from_bytes(file_bytes: bytes) -> dict:
    wb_data = load_workbook(io.BytesIO(file_bytes), data_only=True)
    if "Raw" not in wb_data.sheetnames or "WH" not in wb_data.sheetnames:
        raise ValueError("File Excel harus memiliki sheet 'Raw' dan 'WH' untuk pemrosesan MRP.")

    ws_raw, ws_wh = wb_data["Raw"], wb_data["WH"]
    n_weeks = detect_week_count(ws_raw)
    week_awal = read_week_awal(ws_wh, default=1)
    period_labels = build_period_labels(week_awal, n_weeks)

    records = read_raw_records(ws_raw, n_weeks)
    wh_capacity = read_wh_capacity(ws_wh)

    # B.4: Sheet Harga Container
    harga_dict = {}
    if "Harga Container" in wb_data.sheetnames:
        ws_harga = wb_data["Harga Container"]
        for row in ws_harga.iter_rows(min_row=2, values_only=True):
            if len(row) >= 4:
                cab = str(row[1]).strip() if row[1] else ""
                grp = str(row[2]).strip() if row[2] else ""
                hrg = _safe_float(row[3])
                if cab and grp:
                    harga_dict[(cab, grp)] = hrg

    bal_t, ratio_t = {}, {}
    for rec in records:
        bt = compute_balance_series(rec, n_weeks)
        bal_t[id(rec)] = bt
        ratio_t[id(rec)] = compute_ratio_series(bt, rec, n_weeks)

    occ_t = compute_occupancy(records, bal_t, wh_capacity)

    # B.5: Implementasi MOS
    # TAHAP 5.a: Agregasi Hasil Target
    agg_bal_t = {}
    agg_target = {} # TAHAP 5.c
    for rec in records:
        key = (rec.cabang, rec.grup)
        if key not in agg_bal_t:
            agg_bal_t[key] = [0.0] * n_weeks
            agg_target[key] = [0.0] * n_weeks
        bt = bal_t[id(rec)]
        for w in range(n_weeks):
            agg_bal_t[key][w] += bt[w]
            agg_target[key][w] += rec.target[w]

    mos_rows = []
    for (cab, grp), bals in agg_bal_t.items():
        harga = harga_dict.get((cab, grp), 0.0)
        targs = agg_target[(cab, grp)]
        for w in range(n_weeks):
            val_perhitungan = bals[w]
            # TAHAP 5.b: Lookup & Pembagian Harga
            if harga == 0:
                hasil_bagi_harga = 0.0
            else:
                hasil_bagi_harga = val_perhitungan / harga
            
            # TAHAP 5.d: Kalkulasi Final MOS
            val_target = targs[w]
            if val_target == 0:
                mos = 0.0
            else:
                mos = hasil_bagi_harga / val_target
            
            mos_rows.append({
                "Cabang": cab,
                "Grup": grp,
                "Week": period_labels[w],
                "Hasil_Bagi_Harga": hasil_bagi_harga,
                "MOS": mos
            })
            
    import pandas as pd
    import numpy as np
    df_mos = pd.DataFrame(mos_rows)
    if not df_mos.empty:
        df_mos.replace([np.inf, -np.inf], 0, inplace=True)
        df_mos.fillna(0, inplace=True)

    b64_bal_t = plot_balance_chart_b64(records, bal_t, period_labels, "Tren Balance (Group) - Skenario Target")
    b64_occ_t = plot_occupancy_chart_b64(occ_t, period_labels, "Occupancy Gudang - Skenario Target")

    insights = generate_insights(records, bal_t, ratio_t, occ_t, period_labels, n_weeks)
    html_report = build_html_report_string([
        ("Balance (Group) - Skenario Target", b64_bal_t),
        ("Occupancy - Skenario Target", b64_occ_t),
    ], insights, period_labels, week_awal)

    wb_form = load_workbook(io.BytesIO(file_bytes), data_only=False)
    wb_form, _, _, _ = generate_excel_workbook(wb_form)
    
    # Write "Sheet Hasil" (MOS)
    if not df_mos.empty:
        if "Sheet Hasil" in wb_form.sheetnames:
            del wb_form["Sheet Hasil"]
        ws_mos = wb_form.create_sheet("Sheet Hasil")
        headers = ["No", "Cabang", "Grup", "Week", "Hasil_Bagi_Harga", "MOS"]
        for i, h in enumerate(headers, start=1):
            style_header_cell(ws_mos, 1, i, h, FILL_HEADER2)
        for i, row in enumerate(df_mos.to_dict('records'), start=1):
            ws_mos.append([
                i, row["Cabang"], row["Grup"], row["Week"], row["Hasil_Bagi_Harga"], row["MOS"]
            ])
            
    out_buf = io.BytesIO()
    wb_form.save(out_buf)
    out_buf.seek(0)
    excel_base64 = base64.b64encode(out_buf.read()).decode("ascii")

    daily_data = []
    for cabang, cap_val in wh_capacity:
        series_occ = occ_t.get(cabang, [0.0] * n_weeks)
        for w in range(n_weeks):
            occ_pct = series_occ[w] if series_occ[w] is not None else 0.0
            tot_bal = occ_pct * cap_val if cap_val else 0.0
            daily_data.append({
                "cabang": str(cabang),
                "date": period_labels[w],
                "total_on_hand": round(tot_bal, 2),
                "capacity": round(cap_val, 2),
                "occupancy_pct": round(occ_pct * 100, 2),
                "is_shortage": tot_bal < 0
            })

    shortage_alerts = []
    for rec in records:
        bt = bal_t[id(rec)]
        for w in range(n_weeks):
            if bt[w] < 0:
                shortage_alerts.append({
                    "cabang": rec.cabang,
                    "category": f"{rec.grup} - {rec.category}",
                    "date": period_labels[w],
                    "deficit": round(abs(bt[w]), 2)
                })

    avg_occ = sum(d["occupancy_pct"] for d in daily_data) / len(daily_data) if daily_data else 0
    max_occ = max(d["occupancy_pct"] for d in daily_data) if daily_data else 0

    return {
        "processed_at": datetime.now().isoformat(),
        "daily_data": daily_data,
        "branch_date_summary": daily_data,
        "shortage_alerts": shortage_alerts,
        "kpi_summary": {
            "avg_occupancy": round(avg_occ, 1),
            "max_occupancy": round(max_occ, 1),
            "categories_at_risk": len(shortage_alerts)
        },
        "over_occupancy_insights": insights,
        "inventory_analysis": None,
        "mrp_results": {
            "week_awal": week_awal,
            "period_labels": period_labels,
            "charts": {
                "balance_target": b64_bal_t,
                "occupancy_target": b64_occ_t,
            },
            "html_report": html_report,
            "excel_base64": excel_base64,
            "insights_list": insights,
            "occupancy_series_target": {str(k): [round(v * 100, 2) if v is not None else 0 for v in val] for k, val in occ_t.items()},
        },
        "ddmrp_results": {
            "week_awal": week_awal,
            "period_labels": period_labels,
            "charts": {
                "balance_target": b64_bal_t,
                "occupancy_target": b64_occ_t,
            },
            "html_report": html_report,
            "excel_base64": excel_base64,
            "insights_list": insights,
            "occupancy_series_target": {str(k): [round(v * 100, 2) if v is not None else 0 for v in val] for k, val in occ_t.items()},
        }
    }


def calculate_occupancy(df: pd.DataFrame) -> dict:
    """
    Fallback untuk format dataframe / CSV legacy reguler jika file yang diunggah bukan format multi-sheet Raw & WH.
    """
    if df.empty:
        return {
            "daily_data": [], "branch_date_summary": [], "shortage_alerts": [],
            "kpi_summary": {"avg_occupancy": 0, "max_occupancy": 0, "categories_at_risk": 0},
            "inventory_analysis": None
        }
    if 'Cabang' not in df.columns: df['Cabang'] = 'Unknown'
    if 'Category' not in df.columns: df['Category'] = 'Unknown'
    df = df.copy()
    df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
    df = df.dropna(subset=['Date']).sort_values(by=['Cabang', 'Category', 'Date'])
    cabangs = df['Cabang'].unique()
    
    category_balances = []
    for cabang in cabangs:
        cabang_df = df[df['Cabang'] == cabang]
        for cat in cabang_df['Category'].unique():
            cat_df = cabang_df[cabang_df['Category'] == cat].copy()
            cat_df = cat_df.groupby('Date').agg({'In': 'sum', 'Out': 'sum', 'On Hand': 'first'}).reset_index().sort_values('Date')
            prev_balance = 0
            for idx, row in cat_df.iterrows():
                current_balance = _safe_float(row.get('On Hand', 0)) if idx == 0 else prev_balance + _safe_float(row.get('In', 0)) - _safe_float(row.get('Out', 0))
                prev_balance = current_balance
                category_balances.append({'Cabang': cabang, 'Category': cat, 'Date': row['Date'], 'running_balance': current_balance})

    df_cat_balances = pd.DataFrame(category_balances)
    daily_data, shortage_alerts = [], []
    if not df_cat_balances.empty:
        all_dates = pd.date_range(start=df_cat_balances['Date'].min(), end=df_cat_balances['Date'].max(), freq='D', name='Date')
        pivoted = df_cat_balances.pivot(index='Date', columns=['Cabang', 'Category'], values='running_balance').reindex(all_dates).ffill().fillna(0)
        filled_cat_balances = pivoted.unstack().reset_index(name='running_balance')
        for cabang in cabangs:
            cap_series = pd.to_numeric(df[df['Cabang'] == cabang].get('Capacity', pd.Series()), errors='coerce').dropna()
            capacity_val = _safe_float(cap_series.iloc[0]) if len(cap_series) > 0 else 0.0
            c_balances = filled_cat_balances[filled_cat_balances['Cabang'] == cabang]
            if c_balances.empty: continue
            b_agg = c_balances.groupby('Date')['running_balance'].sum().reset_index().sort_values('Date')
            if capacity_val <= 0: capacity_val = float(max(b_agg['running_balance'].max(), 1.0) * 1.2)
            for _, row in b_agg.iterrows():
                total_balance = _safe_float(row['running_balance'])
                daily_data.append({'cabang': str(cabang), 'date': row['Date'].strftime('%Y-%m-%d'), 'total_on_hand': total_balance, 'capacity': capacity_val, 'occupancy_pct': _safe_float(round((total_balance / capacity_val) * 100, 4)), 'is_shortage': total_balance < 0})
        for _, row in filled_cat_balances.iterrows():
            rb = _safe_float(row['running_balance'])
            if rb < 0: shortage_alerts.append({'cabang': str(row['Cabang']), 'category': str(row['Category']), 'date': row['Date'].strftime('%Y-%m-%d'), 'deficit': round(rb, 2)})

    avg_occ = sum(d['occupancy_pct'] for d in daily_data) / len(daily_data) if daily_data else 0
    max_occ = max(d['occupancy_pct'] for d in daily_data) if daily_data else 0

    return {
        "daily_data": daily_data, "branch_date_summary": daily_data, "shortage_alerts": shortage_alerts,
        "kpi_summary": {"avg_occupancy": round(avg_occ, 2), "max_occupancy": round(max_occ, 2), "categories_at_risk": len(shortage_alerts)},
        "inventory_analysis": inventory_result
    }


def generate_mrp_template_bytes() -> bytes:
    """
    Menghasilkan file Excel template resmi MRP Occupancy & Inventory Projector
    lengkap dengan sheet 'Raw' (blok 4 kolom per minggu [TO, Vessel, Forecast, Target])
    dan sheet 'WH' (Kapasitas & Week Awal).
    """
    wb = Workbook()
    ws_raw = wb.active
    ws_raw.title = "Raw"
    ws_wh = wb.create_sheet("WH")

    n_weeks = 6
    col_start_week = 6  # Kolom F (1-indexed = 6)
    
    for c in range(1, col_start_week):
        style_header_cell(ws_raw, 1, c, "Judul", FILL_JUDUL)
    for w in range(n_weeks):
        base_c = col_start_week + (w * 4)
        for sub_c in range(4):
            style_header_cell(ws_raw, 1, base_c + sub_c, f"Week {w + 1}", FILL_PERHITUNGAN if w % 2 == 0 else FILL_RATIO)

    fixed_headers = ["No", "Cabang", "Grup", "Category", "On Hand"]
    for i, h in enumerate(fixed_headers, start=1):
        style_header_cell(ws_raw, 2, i, h, FILL_HEADER2)

    for w in range(n_weeks):
        base_c = col_start_week + (w * 4)
        style_header_cell(ws_raw, 2, base_c, "TO", FILL_HEADER2)
        style_header_cell(ws_raw, 2, base_c + 1, "Vessel", FILL_HEADER2)
        style_header_cell(ws_raw, 2, base_c + 2, "Forecast", FILL_HEADER2)
        style_header_cell(ws_raw, 2, base_c + 3, "Target", FILL_HEADER2)

    sample_raw = [
        [1, "DC Jakarta", "FMCG", "Beverages", 15000],
        [2, "DC Surabaya", "Electronics", "Gadgets", 8500],
        [3, "DC Medan", "Apparel", "Fashion Casual", 4200],
        [4, "DC Makassar", "Automotive", "Spareparts", 6300]
    ]
    sample_weeks_data = [
        [[1200, 2000, 3000, 3200], [1500, 1000, 3200, 3500], [1000, 2500, 3100, 3400], [2000, 1500, 3500, 3800], [1800, 2000, 3300, 3600], [1500, 1800, 3400, 3700]],
        [[500, 800, 1500, 1400], [600, 900, 1600, 1500], [700, 500, 1700, 1600], [800, 1000, 1800, 1700], [600, 700, 1600, 1500], [500, 800, 1500, 1400]],
        [[200, 300, 600, 700], [300, 400, 700, 800], [250, 350, 650, 750], [400, 500, 800, 900], [300, 400, 700, 800], [200, 300, 600, 700]],
        [[400, 600, 1100, 1200], [500, 700, 1200, 1300], [450, 650, 1150, 1250], [600, 800, 1300, 1400], [500, 700, 1200, 1300], [400, 600, 1100, 1200]],
    ]

    for row_idx, row_base in enumerate(sample_raw, start=3):
        for col_idx, val in enumerate(row_base, start=1):
            cell = ws_raw.cell(row=row_idx, column=col_idx, value=val)
            cell.border = BORDER
        weeks_vals = sample_weeks_data[row_idx - 3]
        for w in range(n_weeks):
            base_c = col_start_week + (w * 4)
            for sub_c, v in enumerate(weeks_vals[w]):
                cell = ws_raw.cell(row=row_idx, column=base_c + sub_c, value=v)
                cell.border = BORDER

    ws_raw.column_dimensions["A"].width = 6
    ws_raw.column_dimensions["B"].width = 15
    ws_raw.column_dimensions["C"].width = 14
    ws_raw.column_dimensions["D"].width = 16
    ws_raw.column_dimensions["E"].width = 12
    for c in range(col_start_week, col_start_week + (n_weeks * 4)):
        ws_raw.column_dimensions[get_column_letter(c)].width = 11
    ws_raw.freeze_panes = "F3"

    wh_headers = ["No", "Cabang", "Kapasitas Existing", "Tambahan", "Total Kapasitas"]
    for i, h in enumerate(wh_headers, start=1):
        style_header_cell(ws_wh, 1, i, h, FILL_HEADER2)

    ws_wh.cell(row=1, column=7, value="Week Awal").font = BOLD
    ws_wh.cell(row=1, column=7).fill = FILL_JUDUL
    ws_wh.cell(row=1, column=7).border = BORDER
    ws_wh.cell(row=1, column=8, value=1).font = BOLD
    ws_wh.cell(row=1, column=8).fill = FILL_RATIO
    ws_wh.cell(row=1, column=8).border = BORDER
    ws_wh.cell(row=1, column=8).alignment = CENTER

    sample_wh = [
        [1, "DC Jakarta", 25000, 5000],
        [2, "DC Surabaya", 15000, 2000],
        [3, "DC Medan", 8000, 1000],
        [4, "DC Makassar", 12000, 1500],
    ]
    for row_idx, row_data in enumerate(sample_wh, start=2):
        for col_idx, val in enumerate(row_data, start=1):
            cell = ws_wh.cell(row=row_idx, column=col_idx, value=val)
            cell.border = BORDER
        tot_cell = ws_wh.cell(row=row_idx, column=5, value=f"=C{row_idx}+D{row_idx}")
        tot_cell.border = BORDER
        tot_cell.font = BOLD

    ws_wh.column_dimensions["A"].width = 6
    ws_wh.column_dimensions["B"].width = 16
    ws_wh.column_dimensions["C"].width = 18
    ws_wh.column_dimensions["D"].width = 14
    ws_wh.column_dimensions["E"].width = 18
    ws_wh.column_dimensions["G"].width = 14
    ws_wh.column_dimensions["H"].width = 10

    out_buf = io.BytesIO()
    wb.save(out_buf)
    out_buf.seek(0)
    return out_buf.read()

# Backward compatibility aliases
calculate_ddmrp_occupancy_from_bytes = calculate_mrp_occupancy_from_bytes
generate_ddmrp_template_bytes = generate_mrp_template_bytes
