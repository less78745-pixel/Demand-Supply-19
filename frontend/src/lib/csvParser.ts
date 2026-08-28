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

    const commaCount = (s.match(/,/g) || []).length;
    const dotCount = (s.match(/\./g) || []).length;

    if (commaCount > 0 && dotCount > 0) {
      // Both separator kinds present - whichever occurs LAST is the decimal
      // point, and every earlier occurrence of either kind is a thousands
      // grouper. This is order-independent, so "1.234.567,89" (EU/ID) and
      // "1,234,567.89" (US) both read correctly regardless of which
      // convention the source file used - the old code always assumed
      // dot=thousands/comma=decimal and silently mis-parsed the US order.
      const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
      num = parseFloat(s.slice(0, lastSep).replace(/[.,]/g, '') + '.' + s.slice(lastSep + 1));
    } else if (commaCount > 1) {
      // Multiple commas, no dot - a number has only one decimal point, so
      // every comma here must be a thousands grouper (e.g. "1,234,567"). The
      // old code only stripped the FIRST comma and left the rest in place,
      // corrupting values like this one entirely.
      num = parseFloat(s.replace(/,/g, ''));
    } else if (commaCount === 1) {
      // Single comma, no dot - Indonesian convention: decimal comma.
      num = parseFloat(s.replace(',', '.'));
    } else if (dotCount > 1) {
      // Multiple dots, no comma - unambiguously thousands groupers with no
      // decimal part (e.g. "1.234.567" = 1234567).
      num = parseFloat(s.replace(/\./g, ''));
    } else if (dotCount === 1) {
      // Single dot, no comma - genuinely ambiguous between "1.234" as the
      // thousands-grouped integer 1234 and the decimal 1.234. Business
      // quantities/currency in this app are essentially never quoted to
      // exactly 3 decimal places, so a 3-digit tail is read as a thousands
      // group; anything else is kept as a decimal point. This is the exact
      // spot the old digit-count heuristic mis-fired on: it applied the same
      // 3-digit rule as intended, but a genuine 3-decimal value ("1.234,500"
      // read via the mixed branch, or a lone "1.234" meant as 1.234 exactly)
      // still got the thousands interpretation and came out 1000x too large -
      // the "outstanding target jadi sangat besar" symptom. Real-world SOH/PR
      // data doesn't carry 3-decimal quantities, so this heuristic stays as
      // the pragmatic default for the single-dot case only.
      const parts = s.split('.');
      num = parts[1].length === 3 ? parseFloat(s.replace('.', '')) : parseFloat(s);
    } else {
      // No separators at all - plain integer/float string.
      num = parseFloat(s);
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
    'pi', 'no pi', 'no_pi', 'no. pi', 'nomor pi', 'pi no', 'invoice', 'no invoice', 'nomor invoice', 'proforma invoice', 'nomor proforma invoice',
    'no sku', 'sku', 'description', 'deskripsi', 'item description', 'nama produk',
    'status compile', 'status', 'state', 'urgency', 'keterangan', 'notes',
    'container', 'no container', 'no_container', 'nocontainer', 'nomor container', 'kontainer', 'no kontainer',
    'bl', 'no bl', 'no_bl', 'no. bl', 'nomor bl', 'bill of lading', 'booking', 'no booking', 'no_booking', 'nomor booking', 'b/l', 'no b/l', 'bl no', 'bl_no',
    'shipping line', 'shipping_line', 'shippingline', 'shipping', 'pelayaran', 'carrier', 'maskapai', 'line',
    'eta fix', 'tanggal eta', 'week eta', 'cut off', 'cutoff', 'eta', 'etd', 'free time end', 'eta_port', 'last checked', 'tanggal', 'date',
    // Exact-match only (not substring) so this never catches a real numeric
    // metric column whose name happens to contain "month", e.g. "AVG SALES
    // MONTH" - that one must still be coerced to a number and stay that way.
    'bulan', 'month', 'periode', 'period', 'tahun', 'year'
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
      const dimWords = ['branch', 'cabang', 'regional', 'region', 'shipping', 'pelayaran', 'carrier', 'maskapai', 'booking', 'container', 'kontainer', 'category', 'kategori', 'grup', 'group', 'divisi', 'status', 'description', 'deskripsi', 'bill of lading', 'tanggal', 'date', 'week eta', 'vendor', 'lading', 'invoice', 'pi', 'proforma'];
      if (dimWords.some(dw => hLower.includes(dw) || hNorm.includes(dw.replace(/[^a-z0-9]/g, '')))) {
        isMetadata = true;
      } else if (/\b(bl|po|pr|pi|cab|sku|line)\b/i.test(hRaw.replace(/[._/-/]/g, ' '))) {
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

      // Normalize whitespace on month/period label columns - a source file
      // exported with inconsistent spacing ("Agustus  2026" vs "Agustus 2026")
      // otherwise reads as two distinct categorical values, silently
      // splitting one real month into multiple buckets downstream (the exact
      // "9.037 vs 25.062" SKU Velocity bug: filters/KPIs that "pick the
      // latest month" only ever see one of the fragments).
      if ((hLower === 'bulan' || hLower === 'month' || hLower === 'periode' || hLower === 'period') && val) {
        val = val.replace(/\s+/g, ' ').trim();
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

const INDONESIAN_MONTH_NAMES: Record<string, number> = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6, juli: 7,
  agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, agu: 8, agt: 8,
  sep: 9, okt: 10, nov: 11, des: 12,
};

// Turns a "BULAN"/"Periode" label (free-text Indonesian month name, MM/YYYY,
// YYYY-MM, or a bare number) into a single YYYYMM-shaped integer so callers
// can sort chronologically instead of falling back to Array.sort()'s default
// lexicographic order (which puts "Agustus" before "Juni" alphabetically,
// even though August comes after June). Values that don't resolve to a
// recognizable month sort last (Infinity) rather than silently as "smallest".
export function getBulanSortKey(val: any): number {
  if (val === null || val === undefined) return Infinity;
  const str = String(val).trim();
  if (!str) return Infinity;
  const lower = str.toLowerCase();

  const yearMatch = lower.match(/(\d{4})/);
  const year = yearMatch ? Number(yearMatch[1]) : 0;

  const monthName = Object.keys(INDONESIAN_MONTH_NAMES).find(m => new RegExp(`\\b${m}`).test(lower));
  if (monthName) {
    return year * 100 + INDONESIAN_MONTH_NAMES[monthName];
  }

  // "2026-08", "08/2026", "08-2026" - whichever side is a valid month (1-12)
  // and the other side plausibly a year decides the order.
  const numMatch = lower.match(/(\d{1,4})\s*[/\-.]\s*(\d{1,4})/);
  if (numMatch) {
    const a = Number(numMatch[1]);
    const b = Number(numMatch[2]);
    if (a > 31) return a * 100 + b;
    if (b > 31) return b * 100 + a;
    if (a >= 1 && a <= 12) return (year || 0) * 100 + a;
  }

  const plainNum = Number(lower.replace(/[^0-9]/g, ''));
  if (!isNaN(plainNum) && plainNum > 0) {
    return plainNum;
  }

  return Infinity;
}

// Sorts BULAN/Periode label arrays chronologically (see getBulanSortKey)
// instead of the lexicographic default `.sort()` would otherwise apply.
export function sortBulans(values: string[]): string[] {
  return [...values].sort((a, b) => getBulanSortKey(a) - getBulanSortKey(b));
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
