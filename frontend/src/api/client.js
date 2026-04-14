import axios from 'axios';

axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);

// Create reusable Axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach JWT access token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// -------------------------------
// Refresh-lock state
//
// ROTATE_REFRESH_TOKENS is enabled on the backend, so each refresh call
// blacklists the old token and issues a new one. If two concurrent requests
// both receive a 401 and both try to refresh, the second refresh call will
// fail with 401 (blacklisted token) and wipe localStorage, causing a
// spurious logout. The lock below ensures only one refresh runs at a time;
// any other 401s that arrive during the refresh are queued and resolved
// (or rejected) once the single refresh completes.
// -------------------------------
let _isRefreshing = false;
let _refreshQueue = []; // [{ resolve, reject }]

function _processQueue(error, token = null) {
  _refreshQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  _refreshQueue = [];
}

// -------------------------------
// RESPONSE INTERCEPTOR
// -------------------------------
apiClient.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // -------------------------------
    // 401 → Try refresh token
    // -------------------------------
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Another refresh is already in flight — queue this request
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          console.warn('No refresh token found.');
          _isRefreshing = false;
          _processQueue(error);
          return Promise.reject(error);
        }

        const refreshRes = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = refreshRes.data?.access;
        if (!newAccessToken) {
          console.warn('Refresh token response missing access token.');
          _isRefreshing = false;
          _processQueue(error);
          return Promise.reject(error);
        }

        // Save new access token and unblock the queue
        localStorage.setItem('authToken', newAccessToken);
        _isRefreshing = false;
        _processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('🔒 Token refresh failed:', refreshError);

        _isRefreshing = false;
        _processQueue(refreshError);

        // Only clear tokens after a confirmed refresh failure so that a
        // transient network error doesn't silently log the user out.
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');

        return Promise.reject(refreshError);
      }
    }

    // -------------------------------
    // KEEP AXIOS ERROR — DO NOT WRAP IT
    // -------------------------------
    console.error('❌ API Error Response:', error.response?.data || error.message);

    // IMPORTANT: return the ORIGINAL Axios error
    // so your app can use `err.response.data.field_errors`
    return Promise.reject(error);
  }
);

export default apiClient;
