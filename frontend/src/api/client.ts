import axios from 'axios';
import { isNativeApp, MOBILE_CLIENT_HEADER, getAuthToken, setAuthToken } from '../native';

// In production the API is proxied at /api on the same host, so one build serves
// every portal hostname and the auth cookie (SameSite=strict) stays first-party.
// The mobile app has no host of its own, so it calls the live portal directly.
const API_URL = isNativeApp
  ? import.meta.env.VITE_NATIVE_API_URL
  : import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// The app authenticates with a Bearer token instead of the cookie.
if (isNativeApp) {
  apiClient.interceptors.request.use((config) => {
    config.headers['X-Client'] = MOBILE_CLIENT_HEADER;
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
}

let isRefreshing = false;

// Response interceptor for error handling and automatic token refresh
apiClient.interceptors.response.use(
  async (response) => {
    // Login and refresh hand the app a new token; keep it.
    if (isNativeApp && typeof response.data?.token === 'string') {
      await setAuthToken(response.data.token);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Don't auto-redirect on 401 from /auth endpoints - let them handle it
    if (error.config?.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    // If we get a 401 and haven't tried refreshing yet, attempt token refresh
    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshing) {
      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Attempt to refresh the token
        await apiClient.post('/auth/refresh');
        console.log('[API] Token refreshed on 401, retrying request');
        isRefreshing = false;

        // Retry the original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        console.error('[API] Token refresh failed, redirecting to login');
        isRefreshing = false;
        await setAuthToken(null);
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // If we already tried refreshing or it's not a 401, just reject
    if (error.response?.status === 401) {
      await setAuthToken(null);
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default apiClient;
