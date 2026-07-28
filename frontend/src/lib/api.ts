import axios from 'axios';

/**
 * API Configuration — Dynamic Backend URL
 *
 * - Development (local):  Uses '' (empty) baseURL → proxied by next.config.mjs rewrites to localhost:8000
 * - Production (Vercel):  Uses NEXT_PUBLIC_API_URL env var → points to localtunnel/ngrok URL
 *
 * The auto-tunnel script (start_backend.ps1) updates NEXT_PUBLIC_API_URL on Vercel automatically.
 */
const getBaseURL = (): string => {
  // Production (Vercel): Use tunnel URL with /api/v1 suffix
  // Example: https://dsp-backend-afif-19.loca.lt/api/v1
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  if (process.env.NODE_ENV === 'production') {
    return 'https://dsp-backend-afif-19.loca.lt/api/v1';
  }

  // Development: Proxy via next.config.mjs rewrites → localhost:8000
  return '/api/v1';
};

export const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 120000, // 2 minutes for ML model training
  headers: {
    'Bypass-Tunnel-Reminder': 'true',
  },
});

// Intercept errors and surface backend detail messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Network error (backend not reachable)
    if (!error.response) {
      const baseURL = getBaseURL();
      error.message = baseURL
        ? `Backend tidak tersedia di ${baseURL}. Pastikan tunnel aktif dan backend berjalan.`
        : 'Backend tidak tersedia. Pastikan backend server berjalan di localhost:8000.';
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
 * Returns true if backend is reachable.
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    // Use absolute path since /health is at root, not under /api/v1
    const baseOrigin = process.env.NEXT_PUBLIC_API_URL
      ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
      : '';
    await axios.get(`${baseOrigin}/health`, {
      timeout: 5000,
      headers: { 'Bypass-Tunnel-Reminder': 'true' },
    });
    return true;
  } catch {
    return false;
  }
};
