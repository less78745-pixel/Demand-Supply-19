import { getStandardFilename } from './export';

/**
 * Multi-sheet Excel export for the Occupancy module: "Analisa Nilai Inventori"
 * (Sheet 1), "Shortage Alerts" (Sheet 2), "Overstock Alerts" (Sheet 3) -- all
 * three built from data ALREADY filtered by whatever cabang/date is active in
 * the UI, unlike the raw MRP workbook openpyxl generates at analyze time
 * (backend has no notion of the live UI filter).
 *
 * `exportOccupancyWorkbook` downloads just these 3 sheets on their own.
 * `exportCombinedWorkbook` appends the same 3 sheets onto an EXISTING raw MRP
 * workbook (loaded from its bytes) so the user gets one file instead of two --
 * `Raw/WH/.../3. Harga & MOS` (from the backend, formulas intact) plus these
 * 3 (built client-side from the live filter).
 */

export interface InventoryValueRow {
  cabang: string;
  grup: string;
  category: string;
  week: string;
  balanceContainer: number;
  qty: number | null;
  hargaSatuan: number | null;
  /** Optional: absent for rows from files still using the pre-Region "Raw"
   * template. Appended as a trailing column (not inserted before the
   * existing A-I columns) so none of the lettered formulas below shift. */
  region?: string | null;
}

export interface AlertRow {
  cabang: string;
  category: string;
  date: string;
  amount: number;
}

export interface OccupancyExportPayload {
  moduleName: string;
  processedAt?: string | null;
  inventoryValueRows: InventoryValueRow[];
  shortageAlerts: AlertRow[];
  overstockAlerts: AlertRow[];
  capacityByCabang: Record<string, number>;
}

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD9D9D9' } };
const SHORTAGE_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4CCCC' } };
const OVERSTOCK_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFE599' } };

/** Base64 (e.g. `mrp_results.excel_base64`) -> ArrayBuffer, for `ExcelJS.Workbook.xlsx.load()`. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Adds the 3 Ringkasan sheets to `wb` in place -- `wb` may already contain other sheets. */
async function appendRingkasanSheets(wb: import('exceljs').Workbook, payload: OccupancyExportPayload) {
  // ── Sheet 1: Analisa Nilai Inventori (Container -> QTY(CBM) -> Value) ──
  const ws1 = wb.addWorksheet('Analisa Nilai Inventori');
  const header1 = ws1.addRow([
    'Cabang', 'Grup', 'Category', 'Week', 'Balance (Container)', 'QTY (CBM)',
    'Harga Satuan', 'Value (Rp)', 'Utilisasi Ruang (%)', 'Region',
  ]);
  header1.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center' };
  });

  // Small Cabang -> Kapasitas lookup table, off to the side, so the
  // utilization formula can VLOOKUP against it without a second sheet.
  const capCabangs = Object.keys(payload.capacityByCabang);
  const capStartRow = 2;
  capCabangs.forEach((cabang, i) => {
    ws1.getCell(`L${capStartRow + i}`).value = cabang;
    ws1.getCell(`M${capStartRow + i}`).value = payload.capacityByCabang[cabang];
  });
  const capRange = capCabangs.length > 0
    ? `$L$${capStartRow}:$M$${capStartRow + capCabangs.length - 1}`
    : null;

  payload.inventoryValueRows.forEach((r, i) => {
    const row = i + 2; // header occupies row 1
    ws1.addRow([r.cabang, r.grup, r.category, r.week, r.balanceContainer, r.qty, r.hargaSatuan, null, null, r.region ?? null]);
    // Native formula: Value = QTY * Harga Satuan
    ws1.getCell(`H${row}`).value = { formula: `F${row}*G${row}` };
    ws1.getCell(`H${row}`).numFmt = '#,##0';
    // Native formula: rasio utilisasi ruang = Balance (Container) / Kapasitas Cabang
    ws1.getCell(`I${row}`).value = capRange
      ? { formula: `IFERROR(E${row}/VLOOKUP(A${row},${capRange},2,FALSE),0)` }
      : 0;
    ws1.getCell(`I${row}`).numFmt = '0.0%';
  });
  ws1.columns.forEach((col) => (col.width = 18));

  // ── Sheet 2: Shortage Alerts (raw, already filtered) ──
  addAlertSheet(wb, 'Shortage Alerts', ['Cabang', 'Category', 'Tanggal', 'Deficit'], payload.shortageAlerts, SHORTAGE_FILL);

  // ── Sheet 3: Overstock Alerts (raw, already filtered) ──
  addAlertSheet(wb, 'Overstock Alerts', ['Cabang', 'Category', 'Tanggal', 'Excess'], payload.overstockAlerts, OVERSTOCK_FILL);
}

function addAlertSheet(
  wb: import('exceljs').Workbook,
  title: string,
  headers: string[],
  rows: AlertRow[],
  fill: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }
) {
  const ws = wb.addWorksheet(title);
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center' };
  });
  rows.forEach((a) => {
    const row = ws.addRow([a.cabang, a.category, a.date, a.amount]);
    row.eachCell((cell) => (cell.fill = fill));
  });
  ws.columns.forEach((col) => (col.width = 22));
}

async function downloadWorkbook(wb: import('exceljs').Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function assertHasData(payload: OccupancyExportPayload) {
  if (
    payload.inventoryValueRows.length === 0 &&
    payload.shortageAlerts.length === 0 &&
    payload.overstockAlerts.length === 0
  ) {
    throw new Error('Tidak ada data untuk filter yang dipilih.');
  }
}

/** Ringkasan-only: 3 sheet dalam file barunya sendiri. */
export async function exportOccupancyWorkbook(payload: OccupancyExportPayload) {
  assertHasData(payload);
  // Loaded on demand, same reasoning as the `xlsx` import in export.ts --
  // exceljs is only needed on the click path, not on every route that
  // merely imports this module for its types.
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await appendRingkasanSheets(wb, payload);
  await downloadWorkbook(wb, getStandardFilename(payload.moduleName + '_Ringkasan', payload.processedAt, 'xlsx'));
}

/**
 * Gabungan: buka workbook mentah (Raw/WH/.../3. Harga & MOS, dengan rumus
 * openpyxl-nya tetap utuh) dari `rawMrpWorkbookBytes`, lalu tambahkan 3 sheet
 * Ringkasan ke workbook YANG SAMA, dan unduh sebagai satu file.
 */
export async function exportCombinedWorkbook(rawMrpWorkbookBytes: ArrayBuffer, payload: OccupancyExportPayload) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(rawMrpWorkbookBytes);
  await appendRingkasanSheets(wb, payload);
  await downloadWorkbook(wb, getStandardFilename(payload.moduleName + '_Lengkap', payload.processedAt, 'xlsx'));
}
