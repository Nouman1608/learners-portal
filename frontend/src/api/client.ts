import axios, { InternalAxiosRequestConfig } from 'axios';
import { isNativeApp, MOBILE_CLIENT_HEADER, getAuthToken, setAuthToken } from '../native';
import { appCampus } from '../appCampus';

// In production the API is proxied at /api on the same host, so one build serves
// every portal hostname and the auth cookie (SameSite=strict) stays first-party.
// The mobile app has no host of its own, so it calls the chosen school's portal directly.
const API_URL = isNativeApp
  ? appCampus?.apiUrl ?? import.meta.env.VITE_NATIVE_API_URL
  : import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

type SessionRequest = InternalAxiosRequestConfig & { _retry?: boolean; _sessionVersion?: number };
let sessionVersion = 0;
let refreshPromise: Promise<void> | null = null;

apiClient.interceptors.request.use((config: SessionRequest) => {
  config._sessionVersion = sessionVersion;
  if (isNativeApp) {
    config.headers['X-Client'] = MOBILE_CLIENT_HEADER;
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    else delete config.headers.Authorization;
  }
  return config;
});

/** Scheduled refreshes and failed requests must share a single token rotation. */
export function refreshSession(): Promise<void> {
  if (!refreshPromise) {
    refreshPromise = apiClient.post('/auth/refresh').then(() => {
      sessionVersion += 1;
    }).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export const isSessionExpired = (error: unknown): boolean =>
  axios.isAxiosError(error) && error.response?.status === 401;

apiClient.interceptors.response.use(
  async (response) => {
    if (isNativeApp && typeof response.data?.token === 'string') {
      await setAuthToken(response.data.token);
    }
    return response;
  },
  async (error) => {
    const request = error.config as SessionRequest | undefined;
    // Auth endpoints handle their own errors, including wrong-password responses.
    if (!request || request.url?.includes('/auth/') || !isSessionExpired(error)) {
      return Promise.reject(error);
    }

    if (!request._retry) {
      request._retry = true;
      try {
        // A late response may belong to the token that was already replaced.
        if (request._sessionVersion === sessionVersion) await refreshSession();
      } catch (refreshError) {
        if (isSessionExpired(refreshError)) {
          await setAuthToken(null);
          window.location.href = '/login';
        }
        // Offline/server failures do not invalidate a saved session.
        return Promise.reject(refreshError);
      }
      return apiClient(request);
    }

    await setAuthToken(null);
    window.location.href = '/login';
    return Promise.reject(error);
  }
);

export default apiClient;
