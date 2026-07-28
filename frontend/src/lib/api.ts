import axios from 'axios';

/**
 * API Configuration
 *
 * Both in development and production, the frontend calls /api/v1/*
 * - Development: next.config.mjs rewrites /api/* → localhost:8000/api/*
 * - Production (Vercel): vercel.json rewrites /api/v1/* → Python serverless function
 *
 * NO external URLs needed. Everything is same-origin.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120000, // 2 minutes for ML processing
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

export const downloadReport = async (taskId: string) => {
  const response = await api.get(`/export/${taskId}`, {
    responseType: 'blob',
  });
  return response.data;
};

/**
 * Health check — ping the backend to verify connectivity.
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    await axios.get('/health', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
};
