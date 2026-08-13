import Papa from 'papaparse';

export interface ParsedData {
  headers: string[];
  targetColumns: { index: number; name: string }[];
  data: any[];
  processed_at?: string;
  sheetNames?: string[];
  sheets?: Record<string, { headers: string[]; targetColumns: { index: number; name: string }[]; data: any[]; lines?: any[][] }>;
}

export function parseIndonesianNumber(val: any): number {
  if (val === null || val === undefined) return 0;
  let num: number;
  if (typeof val === 'number') {
    num = val;
  } else {
    const s = String(val).trim();
    if (s === '' || s === '-' || s === ' - ' || s === '  -   ') return 0;
    
    if (s.includes(',') && !s.includes('.')) {
      num = parseFloat(s.replace(',', '.'));
    } else if (s.includes('.') && !s.includes(',')) {
      const parts = s.split('.');
      if (parts.length === 2 && parts[1].length !== 3) {
        num = parseFloat(s);
      } else {
        num = parseFloat(s.replace(/\./g, ''));
      }
    } else {
      const cleaned = s.replace(/\./g, '').replace(',', '.');
      num = parseFloat(cleaned);
    }
  }

  if (isNaN(num)) return 0;
  // Clean up IEEE 754 floating-point inaccuracies (e.g. 20.999999999999996 -> 21)
  if (Math.abs(num - Math.round(num)) < 0.0001) {
    return Math.round(num);
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function parseLinesSync(lines: any[][]): { headers: string[]; targetColumns: { index: number; name: string }[]; data: any[] } {
  if (lines.length < 2) {
    throw new Error("File terlalu pendek atau kosong.");
  }

  let headerRowIndex = 0;

  // 1. Identify the Header Row
  const headerKeywords = ['cabang', 'cab', 'region', 'branch', 'category', 'kategori', 'item', 'nama barang', 'po no', 'pr no', 'no container', 'container', 'tanggal eta', 'status compile', 'shipping line', 'pelayaran', 'bill of lading', 'no bl', 'no_bl', 'booking', 'description', 'deskripsi', 'grup', 'group', 'divisi', 'qty', 'quantity', 'status insentif', 'status doi', 'on hand'];
  
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
    'cabang', 'region', 'regional', 'branch', 'branch_name', 'branch name', 'cab', 'lokasi',
    'item', 'nama barang', 'category', 'grup', 'group', 'divisi', 'category item', 'item category', 
    'sub item', 'sub item category', 'category dsp', 'status doi', 'doi', 'status insentif', 'category insentif', 'kategori insentif', 'insentif',
    'po no', 'pr no', 'no po', 'no pr', 'po', 'nopr', 'nomor po', 'nomor pr', 'vendor_no', 'vendor', 
    'no sku', 'sku', 'description', 'deskripsi', 'item description', 'nama produk',
    'status compile', 'status', 'state', 'urgency', 'keterangan', 'notes',
    'container', 'no container', 'no_container', 'nocontainer', 'nomor container', 'kontainer', 'no kontainer',
    'bl', 'no bl', 'no_bl', 'no. bl', 'nomor bl', 'bill of lading', 'booking', 'no booking', 'no_booking', 'nomor booking', 'b/l', 'no b/l',
    'shipping line', 'shipping_line', 'shippingline', 'shipping', 'pelayaran', 'carrier', 'maskapai', 'line',
    'eta fix', 'tanggal eta', 'week eta', 'cut off', 'cutoff', 'eta', 'etd', 'free time end', 'eta_port', 'last checked', 'tanggal', 'date'
  ];

  for (let i = 0; i < headers.length; i++) {
    const hRaw = String(headers[i] || '').trim();
    const hLower = hRaw.toLowerCase();
    if (!hLower) continue;

    let isMetadata = false;
    const hNorm = hLower.replace(/[^a-z0-9]/g, '');

    for (const meta of knownMetadata) {
      const metaNorm = meta.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (hLower === meta || hNorm === metaNorm) {
        isMetadata = true;
        break;
      }
    }

    if (!isMetadata) {
      const dimWords = ['branch', 'cabang', 'regional', 'region', 'shipping', 'pelayaran', 'carrier', 'maskapai', 'booking', 'container', 'kontainer', 'category', 'kategori', 'grup', 'group', 'divisi', 'status', 'description', 'deskripsi', 'bill of lading', 'tanggal', 'date', 'week eta', 'vendor', 'lading'];
      if (dimWords.some(dw => hLower.includes(dw) || hNorm.includes(dw.replace(/[^a-z0-9]/g, '')))) {
        isMetadata = true;
      } else if (/\b(bl|po|pr|cab|sku|line)\b/i.test(hRaw.replace(/[._/-/]/g, ' '))) {
        isMetadata = true;
      }
    }

    // Explicit override for numerical metric columns in SOH-to-Vessel and other modules
    const explicitMetrics = ['on hand', 'to week', 'vessel week', 'plan loading', 'target sales', 'outstanding target', 'sales berjalan', 'soh', 'vessel', 'outstanding', 'sales', 'qty', 'value', 'nominal'];
    if (explicitMetrics.some(em => hLower.includes(em))) {
      isMetadata = false;
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
      let val = cols[j] != null ? String(cols[j]).trim() : '';

      // Auto-convert Excel serial date numbers to readable date strings for date/tanggal/ETA columns
      const hLower = headerName.toLowerCase();
      if (((hLower.includes('eta') && !hLower.includes('week')) || hLower.includes('tanggal') || hLower.includes('date') || hLower.includes('tgl') || hLower.includes('waktu')) && val) {
        const numVal = Number(val);
        if (!isNaN(numVal) && numVal > 30000 && numVal < 70000) {
          const d = new Date((numVal - 25569) * 86400 * 1000);
          const days = String(d.getUTCDate()).padStart(2, '0');
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
          const month = months[d.getUTCMonth()];
          val = `${days} ${month} ${d.getUTCFullYear()}`;
        }
      }

      rowObj[headerName] = val;
    }
    
    // Convert target columns to numbers
    for (const tc of targetColumns) {
      rowObj[tc.name] = parseIndonesianNumber(rowObj[tc.name]);
    }

    data.push(rowObj);
  }

  return { headers, targetColumns, data };
}

function processLines(lines: any[][], resolve: (val: ParsedData) => void, reject: (err: any) => void) {
  try {
    const res = parseLinesSync(lines);
    resolve({ ...res, processed_at: new Date().toISOString() });
  } catch (err) {
    reject(err);
  }
}

export async function parseDynamicCSV(file: File): Promise<ParsedData> {
  return new Promise((resolve, reject) => {
    const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name);
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result;
          if (!buffer) return reject(new Error("Gagal membaca buffer file Excel"));
          const XLSX = await import('xlsx');
          const data = new Uint8Array(buffer as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetNames = workbook.SheetNames;
          if (!sheetNames || sheetNames.length === 0) return reject(new Error("File Excel tidak berisikan sheet."));

          const sheets: Record<string, any> = {};
          let firstSheetData: any = null;
          for (const sName of sheetNames) {
            try {
              const sheet = workbook.Sheets[sName];
              const lines = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
              const parsed = parseLinesSync(lines) as any;
              parsed.lines = lines;
              sheets[sName] = parsed;
              if (!firstSheetData) firstSheetData = parsed;
            } catch (err) {
              console.warn(`Skip sheet ${sName}:`, err);
            }
          }

          if (!firstSheetData) return reject(new Error("Gagal memproses sheet dalam file Excel."));

          resolve({
            ...firstSheetData,
            processed_at: new Date().toISOString(),
            sheetNames,
            sheets
          });
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
          try {
            const res = parseLinesSync(results.data as any[][]);
            resolve({ ...res, processed_at: new Date().toISOString() });
          } catch (err) {
            reject(err);
          }
        },
        error: (error: any) => {
          reject(error);
        }
      });
    }
  });
}

export function findColumn(headers: string[], possibleNames: string[]): string | undefined {
  const hLower = headers.map(h => String(h || '').toLowerCase().trim());
  const hNorm = hLower.map(h => h.replace(/[^a-z0-9]/g, ''));

  // Pass 1: Exact Match (either raw lowercased or normalized alphanumeric)
  for (const name of possibleNames) {
    const nLower = name.toLowerCase().trim();
    const nNorm = nLower.replace(/[^a-z0-9]/g, '');
    const idx = hLower.findIndex((h, i) => h === nLower || hNorm[i] === nNorm);
    if (idx !== -1) return headers[idx];
  }

  // Pass 2: Word / Token boundary match
  for (const name of possibleNames) {
    const nLower = name.toLowerCase().trim();
    const regex = new RegExp(`\\b${nLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const idx = headers.findIndex(h => regex.test(String(h || '').replace(/[._/-/]/g, ' ')));
    if (idx !== -1) return headers[idx];
  }

  // Pass 3: Substring fallback (only for search terms >= 3 characters)
  for (const name of possibleNames) {
    const nLower = name.toLowerCase().trim();
    if (nLower.length < 3) continue;
    const idx = hLower.findIndex(h => h.includes(nLower));
    if (idx !== -1) return headers[idx];
  }

  return undefined; 
}
