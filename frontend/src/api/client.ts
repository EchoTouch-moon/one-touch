import axios from 'axios';
import { getAuthSessionEpoch, getCurrentAuthToken } from './authSession';

type AuthRequestConfig = {
  authTokenSnapshot?: string;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (config.headers['X-Skip-Auth']) {
    delete config.headers['X-Skip-Auth'];
    return config;
  }

  const token = getCurrentAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Auth-Session'] = String(getAuthSessionEpoch());
    (config as AuthRequestConfig).authTokenSnapshot = token;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const requestSession = Number(error?.config?.headers?.['X-Auth-Session'] || '0');
      const requestToken = (error?.config as AuthRequestConfig | undefined)?.authTokenSnapshot;
      if (!requestToken) {
        return Promise.reject(error);
      }
      if (requestSession && requestSession !== getAuthSessionEpoch()) {
        return Promise.reject(error);
      }
      if (requestToken && requestToken !== getCurrentAuthToken()) {
        return Promise.reject(error);
      }
      window.localStorage.removeItem('glm-words-auth');
      const suppress = error?.config?.headers?.['X-Suppress-Auth-Expired-Toast'];
      if (!suppress) {
        window.dispatchEvent(new Event('glm-words-auth-expired'));
      }
    }
    return Promise.reject(error);
  },
);

export default api;
