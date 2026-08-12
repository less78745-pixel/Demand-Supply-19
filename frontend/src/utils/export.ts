import * as XLSX from 'xlsx';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Menghasilkan nama file standar sesuai aturan:
 * nama modul_waktu pengolahan terakhir_akun
 * Contoh output: DDMRP_Phase_2_2026-08-03_19-30-00_AFIF.csv
 */
export function getStandardFilename(
  moduleName: string,
  processedAt?: string | null,
  extension?: 'csv' | 'xlsx' | 'json' | 'html'
): string {
  // 1. Bersihkan Nama Modul
  const cleanModule = moduleName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  // 2. Waktu Pengolahan Terakhir (format YYYY-MM-DD_HH-mm-ss)
  let dateObj = processedAt ? new Date(processedAt) : new Date();
  if (isNaN(dateObj.getTime())) {
    dateObj = new Date();
  }
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  const seconds = pad(dateObj.getSeconds());
  const waktuPengolahan = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;

  // 3. Akun Pengguna Aktif
  let accountName = 'Admin';
  try {
    const userState = useAuthStore.getState().user;
    if (userState?.name) {
      accountName = userState.name;
    } else if (typeof window !== 'undefined') {
      const storedUser = window.localStorage.getItem('authUser');
      if (storedUser) {
        const parsed = JSON.parse(storedUser);
        if (parsed?.name || parsed?.username) {
          accountName = parsed.name || parsed.username;
        }
      }
    }
  } catch (e) {
    // Fallback aman
  }
  const cleanAccount = accountName.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  const baseName = `${cleanModule}_${waktuPengolahan}_${cleanAccount}`;
  return extension ? `${baseName}.${extension}` : baseName;
}

/**
 * Ekspor array data JSON ke file Excel (.xlsx) dengan standarisasi nama:
 * nama modul_waktu pengolahan terakhir_akun.xlsx
 */
export function exportToExcel(
  data: any[],
  moduleName: string,
  sheetName: string = "Data",
  processedAt?: string | null
) {
  if (!data || data.length === 0) {
    console.warn("No data to export");
    return;
  }
  
  // Create Worksheet from JSON
  const worksheet = XLSX.utils.json_to_sheet(data);
  
  // Create Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Standarisasi nama file
  const filename = getStandardFilename(moduleName, processedAt, 'xlsx');
  
  // Trigger Download
  XLSX.writeFile(workbook, filename);
}

