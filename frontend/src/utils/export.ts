import * as XLSX from 'xlsx';

/**
 * Ekspor array data JSON ke file Excel (.xlsx)
 * @param data Array object data yang ingin di-export
 * @param filename Nama file output (tanpa .xlsx)
 * @param sheetName Nama sheet (default: Data)
 */
export function exportToExcel(data: any[], filename: string, sheetName: string = "Data") {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }
  
  // Create Worksheet from JSON
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Create Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Trigger Download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
