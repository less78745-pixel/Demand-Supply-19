import Papa from 'papaparse';

export interface ParsedData {
  headers: string[];
  targetColumns: { index: number; name: string }[];
  data: any[];
}

export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === '' || s === '-' || s === ' - ' || s === '  -   ') return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function parseDynamicCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: true,
      complete: (results) => {
        const lines = results.data as string[][];
        
        if (lines.length < 2) {
          return reject(new Error("File terlalu pendek atau kosong."));
        }

        let headerRowIndex = 0;

        // 1. Identify the Header Row
        const headerKeywords = ['cabang', 'cab', 'region', 'category', 'kategori', 'item', 'nama barang', 'po no'];
        
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          const lowerLine = lines[i].join(',').toLowerCase();
          if (headerKeywords.some(k => lowerLine.includes(k))) {
            headerRowIndex = i;
            break;
          }
        }

        const rawHeaders = lines[headerRowIndex];
        const headers = rawHeaders.map(h => h.replace(/[\n\r]/g, ' ').trim());

  // 2. Identify Target Columns (Metrics)
  const targetColumns: { index: number; name: string }[] = [];
  
  // List of known textual / metadata columns. Anything not here is treated as a metric/number.
  const knownMetadata = [
    'cabang', 'region', 'item', 'nama barang', 'category', 'grup', 'category item', 
    'sub item', 'status doi', 'category insentif', 'po no', 'pr no', 'vendor_no', 
    'no sku', 'description', 'status compile', 'container', 'item category', 
    'sub item category', 'category dsp', 'branch_name', 'regional', 'eta fix', 'week eta'
  ];

  for (let i = 0; i < headers.length; i++) {
    const hLower = headers[i].toLowerCase().trim();
    if (!hLower) continue;

    // Is it a known metadata column?
    let isMetadata = false;
    for (const meta of knownMetadata) {
      if (hLower === meta || hLower.replace(/\s+/g, '') === meta.replace(/\s+/g, '')) {
        isMetadata = true;
        break;
      }
    }

    if (!isMetadata) {
      // It must be a metric (Sales, SOH, Vessel, TO, Plan Loading, Ready, etc)
      targetColumns.push({ index: i, name: headers[i] });
    }
  }

        // 3. Parse Data Rows
        const data: any[] = [];
        for (let i = headerRowIndex + 1; i < lines.length; i++) {
          const cols = lines[i];
          if (cols.length === 0 || !cols[0]) continue; 

          const rowObj: any = {};
          for (let j = 0; j < headers.length; j++) {
            const headerName = headers[j] || `Col_${j}`;
            rowObj[headerName] = cols[j] ? cols[j].trim() : '';
          }
          
          // Convert target columns to numbers
          for (const tc of targetColumns) {
            rowObj[tc.name] = parseIndonesianNumber(rowObj[tc.name]);
          }

          data.push(rowObj);
        }

        resolve({ headers, targetColumns, data });
      },
      error: (error: any) => {
        reject(error);
      }
    });
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
