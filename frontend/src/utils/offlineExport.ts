/**
 * Generic "export module to offline-filterable HTML" engine.
 *
 * Unlike the plain DOM-snapshot in exportHtml.ts (which just clones whatever is
 * on screen), this embeds the module's actual result data as JSON in the file
 * and ships a small vanilla-JS runtime that re-filters tables and recomputes
 * KPI numbers client-side. The dropdown filters keep working after the file is
 * saved to disk and opened with no server/network — that's the point.
 *
 * Chrome (hero banner, charts, narrative insight text) is still captured via
 * the existing DOM clone (`cloneCleanedElement`) since that content is prose/SVG,
 * not something that needs re-filtering. Elements marked `.no-export` — including
 * the live MultiSelect dropdowns, scenario tabs, and old KPI/table blocks that
 * this module replaces — are stripped from that clone so nothing dead-looking
 * survives into the offline file.
 */

import { cloneCleanedElement, collectInlineCss } from './exportHtml';

export interface ExportFilterSpec {
  /** Field name each data row is filtered on, e.g. "cabang" */
  field: string;
  /** Label shown above the filter chips, e.g. "Filter Cabang" */
  label: string;
  /** Distinct values to offer (do NOT include an "All" entry — that's automatic) */
  options: string[];
}

export interface ExportColumnSpec {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  format?: 'number' | 'percent' | 'currency-idr' | 'text';
  decimals?: number;
  /** Optional simple threshold highlight, e.g. { above: 100, aboveClass: 'wx-cell-bad' } */
  highlight?: { above?: number; below?: number; aboveClass?: string; belowClass?: string };
}

export interface ExportTableSpec {
  id: string;
  title: string;
  columns: ExportColumnSpec[];
  data: Record<string, unknown>[];
  /** Which of the module's filters (by field) apply to this table. Omit = unfiltered. */
  filterFields?: string[];
  emptyLabel?: string;
}

export interface ExportKpiSpec {
  id: string;
  label: string;
  sourceTableId: string;
  field: string;
  agg: 'avg' | 'sum' | 'max' | 'min' | 'count';
  decimals?: number;
  suffix?: string;
  emptyValue?: string;
}

export interface ModuleExportConfig {
  moduleName: string;
  processedAt?: string;
  /** Optional: clone chrome (hero/charts/narrative) from this element id */
  domElementId?: string;
  filters: ExportFilterSpec[];
  tables: ExportTableSpec[];
  kpis?: ExportKpiSpec[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNumber(value: unknown, decimals = 0): string {
  const num = Number(value);
  if (value === null || value === undefined || value === '' || Number.isNaN(num)) return '-';
  return num.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtValue(col: ExportColumnSpec, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  switch (col.format) {
    case 'percent':
      return fmtNumber(value, col.decimals ?? 1) + '%';
    case 'currency-idr':
      return 'Rp ' + fmtNumber(value, col.decimals ?? 0);
    case 'number':
      return fmtNumber(value, col.decimals ?? 0);
    default:
      return escapeHtml(value);
  }
}

function cellClass(col: ExportColumnSpec, value: unknown): string {
  if (!col.highlight) return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  if (col.highlight.above !== undefined && num > col.highlight.above) return col.highlight.aboveClass || 'wx-cell-bad';
  if (col.highlight.below !== undefined && num < col.highlight.below) return col.highlight.belowClass || 'wx-cell-warn';
  return '';
}

function renderTableRowsHtml(table: ExportTableSpec): string {
  if (!table.data.length) {
    return `<tr><td colspan="${table.columns.length}" class="wx-empty">${escapeHtml(table.emptyLabel || 'Tidak ada data.')}</td></tr>`;
  }
  return table.data
    .map((row) => {
      const cells = table.columns
        .map((col) => {
          const v = row[col.key];
          const align = col.align === 'right' ? 'wx-right' : col.align === 'center' ? 'wx-center' : '';
          const hl = cellClass(col, v);
          return `<td class="${align} ${hl}">${fmtValue(col, v)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
}

function renderTableHtml(table: ExportTableSpec): string {
  const head = table.columns
    .map((col) => {
      const align = col.align === 'right' ? 'wx-right' : col.align === 'center' ? 'wx-center' : '';
      return `<th class="${align}">${escapeHtml(col.label)}</th>`;
    })
    .join('');
  return `
    <div class="wx-table-card">
      <div class="wx-table-header">
        <h3>${escapeHtml(table.title)}</h3>
        <span class="wx-table-count"><span id="wx-count-${table.id}">${table.data.length}</span> baris</span>
      </div>
      <div class="wx-table-scroll">
        <table class="wx-table">
          <thead><tr>${head}</tr></thead>
          <tbody id="wx-tbody-${table.id}">${renderTableRowsHtml(table)}</tbody>
        </table>
      </div>
    </div>`;
}

function aggValue(rows: Record<string, unknown>[], field: string, agg: ExportKpiSpec['agg']): number | null {
  const nums = rows.map((r) => Number(r[field])).filter((n) => !Number.isNaN(n));
  if (agg === 'count') return rows.length;
  if (nums.length === 0) return null;
  switch (agg) {
    case 'sum':
      return nums.reduce((a, b) => a + b, 0);
    case 'avg':
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'max':
      return Math.max(...nums);
    case 'min':
      return Math.min(...nums);
    default:
      return null;
  }
}

function renderKpiHtml(kpi: ExportKpiSpec, tables: ExportTableSpec[]): string {
  const table = tables.find((t) => t.id === kpi.sourceTableId);
  const val = table ? aggValue(table.data, kpi.field, kpi.agg) : null;
  const decimals = kpi.decimals ?? 1;
  const text = val === null ? kpi.emptyValue || '-' : fmtNumber(val, decimals) + (kpi.suffix || '');
  return `
    <div class="wx-kpi-card">
      <div class="wx-kpi-label">${escapeHtml(kpi.label)}</div>
      <div class="wx-kpi-value" id="wx-kpi-${kpi.id}">${escapeHtml(text)}</div>
    </div>`;
}

function renderFilterBarHtml(filters: ExportFilterSpec[]): string {
  if (!filters.length) return '';
  const groups = filters
    .map((f) => {
      const allValuesJson = escapeHtml(JSON.stringify(f.options));
      const allChip = `
        <label class="wx-chip wx-chip-all">
          <input type="checkbox" data-wx-filter="${escapeHtml(f.field)}" data-wx-value="__ALL__" data-wx-allvalues='${allValuesJson}' checked>
          <span>Semua</span>
        </label>`;
      const chips = f.options
        .map(
          (opt) => `
        <label class="wx-chip">
          <input type="checkbox" data-wx-filter="${escapeHtml(f.field)}" data-wx-value="${escapeHtml(opt)}" data-wx-allvalues='${allValuesJson}'>
          <span>${escapeHtml(opt)}</span>
        </label>`
        )
        .join('');
      return `
        <div class="wx-filter-group">
          <div class="wx-filter-label">${escapeHtml(f.label)}</div>
          <div class="wx-filter-chips">${allChip}${chips}</div>
        </div>`;
    })
    .join('');
  return `<div class="wx-filter-bar">${groups}</div>`;
}

const STYLE = `
.wx-section { max-width: 1400px; margin: 24px auto; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #0f172a; }
.wx-section.dark { color: #f1f5f9; }
.wx-section h2 { font-size: 18px; font-weight: 800; margin: 0 0 4px; }
.wx-section p.wx-sub { font-size: 13px; opacity: 0.75; margin: 0 0 16px; }
.wx-filter-bar { display: flex; flex-wrap: wrap; gap: 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
.wx-section.dark .wx-filter-bar { background: #1e293b; border-color: #334155; }
.wx-filter-group { min-width: 220px; }
.wx-filter-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; margin-bottom: 8px; }
.wx-filter-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 140px; overflow-y: auto; }
.wx-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 10px; border-radius: 999px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; user-select: none; }
.wx-section.dark .wx-chip { background: #0f172a; border-color: #334155; color: #f1f5f9; }
.wx-chip input { margin: 0; accent-color: #3b82f6; }
.wx-chip-all { font-weight: 800; }
.wx-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 20px; }
.wx-kpi-card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px 16px; background: #fff; }
.wx-section.dark .wx-kpi-card { background: #0f172a; border-color: #334155; }
.wx-kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; }
.wx-kpi-value { font-size: 26px; font-weight: 800; margin-top: 4px; }
.wx-table-card { border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
.wx-section.dark .wx-table-card { border-color: #334155; }
.wx-table-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 12px 16px; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; }
.wx-section.dark .wx-table-header { background: #1e293b; border-color: #334155; }
.wx-table-header h3 { font-size: 14px; font-weight: 800; margin: 0; text-transform: uppercase; letter-spacing: 0.02em; }
.wx-table-count { font-size: 11px; opacity: 0.7; font-weight: 600; }
.wx-table-scroll { overflow-x: auto; max-height: 480px; overflow-y: auto; }
.wx-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.wx-table thead th { position: sticky; top: 0; background: #f8fafc; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; padding: 10px 14px; border-bottom: 1px solid #cbd5e1; }
.wx-section.dark .wx-table thead th { background: #0f172a; border-color: #334155; }
.wx-table td { padding: 9px 14px; border-bottom: 1px solid #e2e8f0; }
.wx-section.dark .wx-table td { border-color: #1e293b; }
.wx-right { text-align: right; }
.wx-center { text-align: center; }
.wx-empty { text-align: center; opacity: 0.6; font-style: italic; padding: 24px !important; }
.wx-cell-bad { color: #dc2626; font-weight: 800; }
.wx-section.dark .wx-cell-bad { color: #f87171; }
.wx-cell-warn { color: #d97706; font-weight: 700; }
.wx-section.dark .wx-cell-warn { color: #fbbf24; }
`;

function buildRuntimeScript(config: { filters: ExportFilterSpec[]; tables: ExportTableSpec[]; kpis: ExportKpiSpec[] }): string {
  // Guard against a value containing "</script>" breaking out of the inline script tag.
  const json = JSON.stringify(config).replace(/<\/script/gi, '<\\/script');
  return `
<script>
(function(){
  var CONFIG = ${json};
  var state = {};
  CONFIG.filters.forEach(function(f){ state[f.field] = new Set(['__ALL__']); });

  function fmtNumber(v, decimals){
    var n = Number(v);
    if (v === null || v === undefined || v === '' || isNaN(n)) return '-';
    return n.toLocaleString('id-ID', { minimumFractionDigits: decimals||0, maximumFractionDigits: decimals||0 });
  }
  function escapeHtml(v){
    return String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtValue(col, v){
    if (v === null || v === undefined || v === '') return '-';
    if (col.format === 'percent') return fmtNumber(v, col.decimals != null ? col.decimals : 1) + '%';
    if (col.format === 'currency-idr') return 'Rp ' + fmtNumber(v, col.decimals != null ? col.decimals : 0);
    if (col.format === 'number') return fmtNumber(v, col.decimals != null ? col.decimals : 0);
    return escapeHtml(v);
  }
  function cellClass(col, v){
    if (!col.highlight) return '';
    var num = Number(v);
    if (isNaN(num)) return '';
    if (col.highlight.above != null && num > col.highlight.above) return col.highlight.aboveClass || 'wx-cell-bad';
    if (col.highlight.below != null && num < col.highlight.below) return col.highlight.belowClass || 'wx-cell-warn';
    return '';
  }
  function rowMatches(row, table){
    var fields = table.filterFields || [];
    for (var i=0;i<fields.length;i++){
      var sel = state[fields[i]];
      if (!sel || sel.has('__ALL__')) continue;
      if (!sel.has(String(row[fields[i]]))) return false;
    }
    return true;
  }
  function aggValue(rows, field, agg){
    if (agg === 'count') return rows.length;
    var nums = rows.map(function(r){ return Number(r[field]); }).filter(function(n){ return !isNaN(n); });
    if (nums.length === 0) return null;
    if (agg === 'sum') return nums.reduce(function(a,b){return a+b;},0);
    if (agg === 'avg') return nums.reduce(function(a,b){return a+b;},0)/nums.length;
    if (agg === 'max') return Math.max.apply(null, nums);
    if (agg === 'min') return Math.min.apply(null, nums);
    return null;
  }
  function renderTable(table){
    var filtered = table.data.filter(function(row){ return rowMatches(row, table); });
    var tbody = document.getElementById('wx-tbody-' + table.id);
    var countEl = document.getElementById('wx-count-' + table.id);
    if (countEl) countEl.textContent = filtered.length.toLocaleString('id-ID');
    if (!tbody) return;
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="' + table.columns.length + '" class="wx-empty">' + escapeHtml(table.emptyLabel || 'Tidak ada data untuk filter yang dipilih.') + '</td></tr>';
      return;
    }
    var html = '';
    for (var i=0;i<filtered.length;i++){
      var row = filtered[i];
      html += '<tr>';
      for (var c=0;c<table.columns.length;c++){
        var col = table.columns[c];
        var v = row[col.key];
        var align = col.align === 'right' ? 'wx-right' : (col.align === 'center' ? 'wx-center' : '');
        var hl = cellClass(col, v);
        html += '<td class="' + align + ' ' + hl + '">' + fmtValue(col, v) + '</td>';
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
  }
  function renderKpi(kpi){
    var el = document.getElementById('wx-kpi-' + kpi.id);
    if (!el) return;
    var table = null;
    for (var i=0;i<CONFIG.tables.length;i++){ if (CONFIG.tables[i].id === kpi.sourceTableId) { table = CONFIG.tables[i]; break; } }
    if (!table) return;
    var filtered = table.data.filter(function(row){ return rowMatches(row, table); });
    var val = aggValue(filtered, kpi.field, kpi.agg);
    if (val === null) { el.textContent = kpi.emptyValue || '-'; return; }
    var decimals = kpi.decimals != null ? kpi.decimals : 1;
    el.textContent = fmtNumber(val, decimals) + (kpi.suffix || '');
  }
  function renderAll(){
    CONFIG.tables.forEach(renderTable);
    (CONFIG.kpis || []).forEach(renderKpi);
  }
  function syncCheckboxes(field){
    var sel = state[field];
    var isAll = sel.has('__ALL__');
    var boxes = document.querySelectorAll('[data-wx-filter="'+field+'"]');
    for (var i=0;i<boxes.length;i++){
      var cb = boxes[i];
      var v = cb.getAttribute('data-wx-value');
      cb.checked = v === '__ALL__' ? isAll : (isAll || sel.has(v));
    }
  }
  function toggleOption(field, value, allValues){
    var sel = state[field];
    if (value === '__ALL__') {
      sel.clear(); sel.add('__ALL__');
    } else {
      if (sel.has('__ALL__')) sel.clear();
      if (sel.has(value)) sel.delete(value); else sel.add(value);
      if (sel.size === 0) sel.add('__ALL__');
      else if (sel.size === allValues.length) { sel.clear(); sel.add('__ALL__'); }
    }
    syncCheckboxes(field);
    renderAll();
  }
  document.addEventListener('change', function(e){
    var el = e.target;
    if (!el || !el.getAttribute || !el.getAttribute('data-wx-filter')) return;
    var field = el.getAttribute('data-wx-filter');
    var value = el.getAttribute('data-wx-value');
    var allValues = [];
    try { allValues = JSON.parse(el.getAttribute('data-wx-allvalues') || '[]'); } catch(err) {}
    toggleOption(field, value, allValues);
  });
  renderAll();
})();
</script>`;
}

/**
 * Build the full standalone HTML document for a module: optional cloned chrome
 * (hero/charts/narrative) plus a generic, data-driven filter+table+KPI section
 * that keeps working with no server once the file is saved to disk.
 */
export function buildOfflineExportHtml(config: ModuleExportConfig): string {
  const cssRules = collectInlineCss();
  const bodyClass = typeof document !== 'undefined' ? document.body.className : '';
  const isDark = bodyClass.includes('dark');

  let chromeHtml = '';
  if (config.domElementId) {
    const cloned = cloneCleanedElement(config.domElementId);
    chromeHtml = cloned.outerHTML;
  }

  const kpis = config.kpis || [];
  const filterBarHtml = renderFilterBarHtml(config.filters);
  const kpiGridHtml = kpis.length ? `<div class="wx-kpi-grid">${kpis.map((k) => renderKpiHtml(k, config.tables)).join('')}</div>` : '';
  const tablesHtml = config.tables.map(renderTableHtml).join('');
  const runtimeScript = buildRuntimeScript({ filters: config.filters, tables: config.tables, kpis });

  const processedLabel = config.processedAt ? new Date(config.processedAt).toLocaleString('id-ID') : '-';

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.moduleName)} — Export Offline</title>
  <style>
    ${cssRules}
    body { margin: 0; padding: 20px; min-height: 100vh; }
    ${STYLE}
  </style>
</head>
<body class="${escapeHtml(bodyClass)}">
  ${chromeHtml ? `<div style="max-width:1400px;margin:0 auto;">${chromeHtml}</div>` : ''}

  <div class="wx-section ${isDark ? 'dark' : ''}">
    <h2>🔍 Data Interaktif (Mode Offline) — ${escapeHtml(config.moduleName)}</h2>
    <p class="wx-sub">File hasil export statis. Diolah terakhir: ${escapeHtml(processedLabel)}. Filter di bawah bekerja tanpa koneksi internet atau server.</p>
    ${filterBarHtml}
    ${kpiGridHtml}
    ${tablesHtml}
  </div>

  ${runtimeScript}
</body>
</html>
  `.trim();
}
