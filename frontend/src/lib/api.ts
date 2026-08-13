import axios from 'axios';

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
  (error) => {
    if (!error.response) {
      error.message = 'Backend tidak tersedia. Pastikan backend server berjalan.';
      return Promise.reject(error);
    }
    const detail = error?.response?.data?.detail;
    if (detail) {
      const msg = typeof detail === 'string' ? detail : JSON.stringify(detail);
      error.message = msg;
    }
    return Promise.reject(error);
  }
);

// ── API Functions ──

export const uploadOccupancyFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/analyze/occupancy', formData);
  return response.data;
};

export const downloadOccupancyTemplate = async () => {
  const response = await api.get('/analyze/occupancy/template', {
    responseType: 'blob',
  });
  return response.data;
};

export const uploadForecastFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/analyze/forecast', formData);
  return response.data;
};

export const uploadInventoryFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/analyze/inventory', formData);
  return response.data;
};

// ── SCM Analytic API Functions ──

export const uploadSafetyStockFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/analyze/safety-stock', formData);
  return response.data;
};

export const uploadRebalancingFiles = async (stockFile: File, demandFile: File, freightFile: File) => {
  const formData = new FormData();
  formData.append('stock_file', stockFile);
  formData.append('demand_file', demandFile);
  formData.append('freight_file', freightFile);
  const response = await api.post('/analyze/rebalancing', formData);
  return response.data;
};

export const uploadLandedCostFiles = async (trackingFile: File, allocationFile: File, exchangeRate?: number) => {
  const formData = new FormData();
  formData.append('tracking_file', trackingFile);
  formData.append('allocation_file', allocationFile);
  if (exchangeRate) formData.append('exchange_rate', exchangeRate.toString());
  const response = await api.post('/analyze/landed-cost', formData);
  return response.data;
};

export const uploadControlTowerFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
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
  formData.append('file', file);
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
  formData.append('file', file);
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
  formData.append('file', file);
  formData.append('num_hubs', String(numHubs));
  formData.append('cost_per_cbm_km', String(costPerCbmKm));
  const response = await api.post(`/wh-trans/file`, formData);
  return response.data;
};

