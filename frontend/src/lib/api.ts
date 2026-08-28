import axios from 'axios';
import { supabase } from './supabase';

/**
 * API Configuration
 *
 * In production (Vercel): vercel.json rewrites /api/v1/* → Python serverless function
 * In development: Direct call to FastAPI on 127.0.0.1:8000 to bypass Next.js rewrites 30s timeout limitation
 */
export const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://127.0.0.1:8000/api/v1',
  timeout: 300000, // 5 minutes for heavy ML processing (forecast runs 16 models)
});

// Intercept errors and surface backend detail messages
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      error.message = 'Backend tidak tersedia. Pastikan backend server berjalan.';
      return Promise.reject(error);
    }
    let detail = error?.response?.data?.detail;
    // responseType: 'blob' requests (file downloads) get their error body back as a
    // Blob too, so `detail` above is never populated for them - read it out manually.
    if (!detail && error.response.data instanceof Blob && error.response.data.type.includes('json')) {
      try {
        detail = JSON.parse(await error.response.data.text())?.detail;
      } catch {
        // Blob wasn't valid JSON after all - fall through to the generic message below.
      }
    }
    if (detail) {
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      error.message = msg;
    }
    return Promise.reject(error);
  }
);

// ── API Functions ──

// Vercel Serverless Functions hard-cap request bodies at 4.5MB regardless of
// plan. Give ourselves headroom under that hard cap for multipart overhead.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * Shrink a file for upload and guard against the platform's payload cap.
 * Excel workbooks carry heavy XML/styling overhead vs. their actual data, so
 * converting to CSV before upload buys a lot of headroom - every module's
 * upload function below runs the file through this first instead of each
 * page reimplementing it (previously only the forecast page did this, and
 * even there it ran after the dropzone's own size check, so it never had a
 * chance to help on the exact large files it was meant for).
 *
 * A workbook can also split branches/regions across multiple sheets (e.g.
 * one per city) - reading only the first sheet would silently drop every
 * other sheet's rows, so all non-empty sheets are concatenated under the
 * first sheet's header before the CSV conversion.
 */
async function prepareUploadFile(file: File): Promise<File> {
  let payloadFile = file;

  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });

    const allData: any[] = [];
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
      if (!rows || rows.length === 0) continue;
      
      for (const row of rows as any[]) {
        // Inject sheet name as Cabang if missing (very common for multi-city workbooks)
        if (!row['Cabang'] || String(row['Cabang']).trim() === '') {
          row['Cabang'] = sheetName;
        }
        allData.push(row);
      }
    }

    if (allData.length > 0) {
      const combinedSheet = XLSX.utils.json_to_sheet(allData);
      const csvStr = XLSX.utils.sheet_to_csv(combinedSheet);
      payloadFile = new File([csvStr], file.name.replace(/\.xlsx?$/i, '.csv'), { type: 'text/csv' });
    }
  }

  if (payloadFile.size > MAX_UPLOAD_BYTES) {
    const mb = (payloadFile.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `File terlalu besar untuk diproses sekaligus (${mb}MB, maks ±4MB setelah konversi ke CSV). ` +
      `Pecah file menjadi beberapa bagian (mis. per cabang atau per bulan) lalu upload satu per satu.`
    );
  }

  return payloadFile;
}

export const uploadOccupancyFile = async (file: File) => {
  const formData = new FormData();
  // Bypass prepareUploadFile because Occupancy MRP requires the original 
  // multi-sheet Excel file (Raw, WH, Harga Container) and cannot be flattened to CSV.
  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(
      `File terlalu besar untuk diproses sekaligus (${mb}MB, maks ±4MB). ` +
      `Pecah file menjadi beberapa bagian lalu upload satu per satu.`
    );
  }
  formData.append('file', file);
  const response = await api.post('/analyze/occupancy', formData);
  return response.data;
};

// ── Upload asinkron via Supabase Storage (bypass limit payload 4.5MB Vercel) ──
// Alur: upload file mentah ke Storage (bukan ke endpoint FastAPI) -> insert baris
// job tracking -> panggil endpoint FastAPI hanya dengan job_id + storage_path
// (payload kecil, tidak pernah menyentuh limit). FastAPI memproses file di
// BackgroundTasks dan menyimpan hasil ke `processed_results`, yang sudah
// otomatis diterima halaman ini lewat realtime subscription yang sudah ada.
const DSP_UPLOAD_BUCKET = 'dsp-raw-uploads';

export interface OccupancyJobHandle {
  jobId: string;
  storagePath: string;
}

export const uploadOccupancyFileAsync = async (file: File): Promise<OccupancyJobHandle> => {
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error('Hanya file Excel (.xlsx/.xls) yang didukung untuk analisa MRP.');
  }

  const jobId = crypto.randomUUID();
  const storagePath = `occupancy/${jobId}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from(DSP_UPLOAD_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (uploadError) {
    throw new Error(`Gagal mengunggah file ke Supabase Storage: ${uploadError.message}`);
  }

  // id di-generate di sini (bukan mengandalkan default kolom di DB) supaya tidak
  // bergantung pada `gen_random_uuid()` benar-benar terpasang sebagai default --
  // sekaligus job id sudah pasti diketahui sebelum insert, jadi tidak ada celah
  // waktu untuk dedup by job_id di realtime handler.
  const { data: job, error: jobError } = await supabase
    .from('dsp_processing_jobs')
    .insert({ id: jobId, module: 'occupancy', storage_path: storagePath, status: 'pending' })
    .select('id')
    .single();
  if (jobError || !job) {
    throw new Error(`Gagal membuat job tracking: ${jobError?.message ?? 'unknown error'}`);
  }

  // Ditulis SEKARANG (bukan setelah job selesai) supaya realtime INSERT handler
  // di processed_results bisa langsung mengenali "ini hasil upload saya sendiri"
  // begitu event itu tiba -- tidak peduli mana yang lebih dulu sampai, event job
  // UPDATE atau event processed_results INSERT (lihat page.tsx dedup by job_id).
  sessionStorage.setItem('last_dsp_job_id_occupancy', jobId);

  await api.post('/analyze/occupancy/async', {
    job_id: jobId,
    storage_path: storagePath,
  });

  return { jobId, storagePath };
};

export const downloadOccupancyTemplate = async () => {
  const response = await api.get('/analyze/occupancy/template', {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * Download the processed MRP Excel workbook. Large datasets store the workbook
 * in Supabase Storage instead of embedding it as base64 in `mrp_results.excel_base64`
 * (that embedding was blowing up `processed_results` rows past Supabase Realtime's
 * broadcast limit, which silently broke the dashboard's live sync) -- this fetches
 * a short-lived signed URL from the backend and downloads through it instead.
 */
export const downloadOccupancyExcelFromStorage = async (storagePath: string) => {
  const response = await api.get('/analyze/occupancy/download-excel', {
    params: { path: storagePath },
    responseType: 'blob',
    maxRedirects: 5,
  });
  return response.data;
};

export const uploadForecastFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  const response = await api.post('/analyze/forecast', formData);
  return response.data;
};

/**
 * Fetch one page of a previously computed forecast's `forecast_data`.
 * Large uploads produce more rows than fit in a single 4.5MB Vercel
 * response, so `/analyze/forecast` returns only the first page plus a
 * `result_id` - the rest is paged in through this endpoint (see
 * fetchAllForecastPages in the forecast page for the assembly loop).
 */
export const fetchForecastPage = async (resultId: number, offset: number, limit = 8000) => {
  const response = await api.get(`/analyze/forecast/${resultId}/page`, {
    params: { offset, limit },
  });
  return response.data;
};

export const uploadInventoryFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  const response = await api.post('/analyze/inventory', formData);
  return response.data;
};

// ── SCM Analytic API Functions ──

export const uploadSafetyStockFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  const response = await api.post('/analyze/safety-stock', formData);
  return response.data;
};

export const uploadRebalancingFiles = async (stockFile: File, demandFile: File, freightFile: File) => {
  const formData = new FormData();
  const [stock, demand, freight] = await Promise.all([
    prepareUploadFile(stockFile),
    prepareUploadFile(demandFile),
    prepareUploadFile(freightFile),
  ]);
  formData.append('stock_file', stock);
  formData.append('demand_file', demand);
  formData.append('freight_file', freight);
  const response = await api.post('/analyze/rebalancing', formData);
  return response.data;
};

export const uploadLandedCostFiles = async (trackingFile: File, allocationFile: File, exchangeRate?: number) => {
  const formData = new FormData();
  const [tracking, allocation] = await Promise.all([
    prepareUploadFile(trackingFile),
    prepareUploadFile(allocationFile),
  ]);
  formData.append('tracking_file', tracking);
  formData.append('allocation_file', allocation);
  if (exchangeRate) formData.append('exchange_rate', exchangeRate.toString());
  const response = await api.post('/analyze/landed-cost', formData);
  return response.data;
};

export const uploadControlTowerFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  const response = await api.post('/analyze/control-tower', formData);
  return response.data;
};

/**
 * Health check — ping the backend to verify connectivity.
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const healthUrl = process.env.NODE_ENV === 'production' ? '/health' : 'http://127.0.0.1:8000/health';
    await axios.get(healthUrl, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};

// ── DDMRP API Functions ──

export const analyzeDDMRPManual = async (params: Record<string, number>) => {
  const response = await api.post('/analyze/ddmrp/manual', params);
  return response.data;
};

export const uploadDDMRPFile = async (
  file: File,
  params: { dlt_days: number; moq: number; order_cycle_days: number; on_hand: number; on_order: number; qualified_demand: number }
) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => queryParams.append(k, String(v)));
  const response = await api.post(`/analyze/ddmrp?${queryParams.toString()}`, formData);
  return response.data;
};

// ── Route Optimization API Functions ──

export const analyzeRouteOptimization = async (params: Record<string, unknown>) => {
  const response = await api.post('/analyze/route-optimization', params);
  return response.data;
};

export const uploadRouteOptimizationFile = async (
  file: File,
  params: Record<string, any>
) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      if (typeof v === 'object' && !Array.isArray(v)) {
        Object.entries(v).forEach(([subKey, subVal]) => {
          if (subVal !== undefined && subVal !== null) {
            formData.append(subKey, String(subVal));
          }
        });
      } else {
        formData.append(k, String(v));
      }
    }
  });
  const response = await api.post('/analyze/route-optimization/file', formData);
  return response.data;
};


// ── Dual Export (HTML + Excel raw data terfilter cabang, dibundel .zip) ──

export interface DualExportPayload {
  moduleName: string;
  processedAt?: string;
  /** Filter cabang aktif di halaman saat ini. `['All']` = tanpa filter. */
  cabang: string[];
  htmlContent: string;
  /** Nama file dasar tanpa ekstensi, biasanya dari getStandardFilename(). */
  baseFilename: string;
  /** Salah satu dari resultId atau rows wajib diisi sebagai sumber data Excel. */
  resultId?: number;
  rows?: Record<string, unknown>[];
  /** Key di result_json yang berisi array baris data (hanya relevan bila pakai resultId). */
  dataKey?: string;
  /** Override nama kolom cabang pada rows, kalau auto-detect di backend tidak cocok. */
  cabangField?: string;
}

export const exportDualFormat = async (payload: DualExportPayload): Promise<Blob> => {
  const response = await api.post(
    '/export/dual',
    {
      module_name: payload.moduleName,
      processed_at: payload.processedAt,
      cabang: payload.cabang,
      html_content: payload.htmlContent,
      base_filename: payload.baseFilename,
      result_id: payload.resultId,
      rows: payload.rows,
      data_key: payload.dataKey,
      cabang_field: payload.cabangField,
    },
    { responseType: 'blob' }
  );
  return response.data;
};

export const getWHTransDummyData = async (numCustomers: number = 100) => {
  const response = await api.get(`/wh-trans/dummy-data?num_customers=${numCustomers}`);
  return response.data;
};

export const simulateWHTrans = async (numHubs: number, data: any) => {
  const response = await api.post(`/wh-trans/simulate`, { num_hubs: numHubs, data: data });
  return response.data;
};

export const uploadWHTransFile = async (file: File, numHubs: number, costPerCbmKm: number) => {
  const formData = new FormData();
  formData.append('file', await prepareUploadFile(file));
  formData.append('num_hubs', String(numHubs));
  formData.append('cost_per_cbm_km', String(costPerCbmKm));
  const response = await api.post(`/wh-trans/file`, formData);
  return response.data;
};

