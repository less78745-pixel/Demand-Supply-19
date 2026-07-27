import axios from 'axios';

// IMPORTANT: Do NOT set Content-Type for multipart/form-data.
// Axios/browser must set it automatically with the correct boundary.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api/v1',
  timeout: 120000, // 2 minutes for ML model training
  headers: {
    'Bypass-Tunnel-Reminder': 'true'
  }
});

// Intercept errors and surface backend detail messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Network error (backend not reachable)
    if (!error.response) {
      error.message =
        'Backend tidak tersedia. Pastikan backend server berjalan di localhost:8000, atau set NEXT_PUBLIC_API_URL.';
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
