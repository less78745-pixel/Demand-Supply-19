import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface ParsedData {
  headers: string[];
  targetColumns: { index: number; name: string }[];
  data: any[];
  processed_at?: string;
}

export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === ' - ' || s === '  -   ') return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function processLines(lines: any[][], resolve: (val: ParsedData) => void, reject: (err: any) => void) {
  try {
    if (lines.length < 2) {
      return reject(new Error("File terlalu pendek atau kosong."));
    }

    let headerRowIndex = 0;

    // 1. Identify the Header Row
    const headerKeywords = ['cabang', 'cab', 'region', 'category', 'kategori', 'item', 'nama barang', 'po no', 'pr no'];
    
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (!lines[i]) continue;
      const lowerLine = lines[i].map(c => String(c || '').toLowerCase()).join(',');
      if (headerKeywords.some(k => lowerLine.includes(k))) {
        headerRowIndex = i;
        break;
      }
    }

    const rawHeaders = (lines[headerRowIndex] || []).map(h => String(h || '').replace(/[\n\r]/g, ' ').trim());
    const headers = rawHeaders;

    // 2. Identify Target Columns (Metrics)
    const targetColumns: { index: number; name: string }[] = [];
    
    const knownMetadata = [
      'cabang', 'region', 'item', 'nama barang', 'category', 'grup', 'category item', 
      'sub item', 'status doi', 'category insentif', 'po no', 'pr no', 'vendor_no', 
      'no sku', 'description', 'status compile', 'container', 'item category', 
      'sub item category', 'category dsp', 'branch_name', 'regional', 'eta fix', 'week eta', 'cut off', 'cutoff'
    ];

    for (let i = 0; i < headers.length; i++) {
      const hLower = headers[i].toLowerCase().trim();
      if (!hLower) continue;

      let isMetadata = false;
      for (const meta of knownMetadata) {
        if (hLower === meta || hLower.replace(/\s+/g, '') === meta.replace(/\s+/g, '')) {
          isMetadata = true;
          break;
        }
      }

      if (!isMetadata) {
        targetColumns.push({ index: i, name: headers[i] });
      }
    }

    // 3. Parse Data Rows
    const data: any[] = [];
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const cols = lines[i];
      if (!cols || cols.length === 0 || (!cols[0] && !cols[1])) continue; 

      const rowObj: any = {};
      for (let j = 0; j < headers.length; j++) {
        const headerName = headers[j] || `Col_${j}`;
        rowObj[headerName] = cols[j] != null ? String(cols[j]).trim() : '';
      }
      
      // Convert target columns to numbers
      for (const tc of targetColumns) {
        rowObj[tc.name] = parseIndonesianNumber(rowObj[tc.name]);
      }

      data.push(rowObj);
    }

    resolve({ headers, targetColumns, data, processed_at: new Date().toISOString() });
  } catch (err) {
    reject(err);
  }
}

export async function parseDynamicCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result;
          if (!buffer) return reject(new Error("Gagal membaca buffer file Excel"));
          const data = new Uint8Array(buffer as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const lines = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
          processLines(lines, resolve, reject);
        } catch (err) {
          reject(new Error("Gagal memproses file Excel: " + (err instanceof Error ? err.message : String(err))));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        skipEmptyLines: true,
        complete: (results) => {
          processLines(results.data as any[][], resolve, reject);
        },
        error: (error: any) => {
          reject(error);
        }
      });
    }
  });
}

export function findColumn(headers: string[], possibleNames: string[]): string | undefined {
  const hLower = headers.map(h => h.toLowerCase().trim());
  for (const name of possibleNames) {
    const idx = hLower.findIndex(h => h.includes(name.toLowerCase()));
    if (idx !== -1) return headers[idx];
  }
  return undefined; 
}
