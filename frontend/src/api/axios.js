import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_KEY = 'lexisgraph-api-base-url';
const DEFAULT_API_BASE = 'http://127.0.0.1:8001/api/v1';

export const getApiBaseUrl = () => localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE;
export const getServerBaseUrl = () => getApiBaseUrl().replace(/\/api\/v1\/?$/, '');

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 60000
});

export const setApiBaseUrl = (baseUrl) => {
  const normalized = (baseUrl || '').trim().replace(/\/$/, '');
  const withPrefix = normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
  localStorage.setItem(API_BASE_KEY, withPrefix);
  api.defaults.baseURL = withPrefix;
};

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (!err.config?.suppressErrorToast) {
      toast.error(err.response?.data?.detail || err.response?.data?.message || 'API Error', {
        duration: 5000
      });
    }
    return Promise.reject(err);
  }
);

export default api;
