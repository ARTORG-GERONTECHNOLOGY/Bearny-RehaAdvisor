import axios from 'axios';

axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);

// Create reusable Axios instance.
// withCredentials sends httpOnly auth cookies automatically on every request.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// -------------------------------
// Refresh-lock state
//
// ROTATE_REFRESH_TOKENS is enabled on the backend, so each refresh call
// blacklists the old token and issues a new one. If two concurrent requests
// both receive a 401 and both try to refresh, the second refresh call will
// fail with 401 (blacklisted token) and wipe cookies, causing a spurious
// logout. The lock below ensures only one refresh runs at a time; any other
// 401s that arrive during the refresh are queued and resolved (or rejected)
// once the single refresh completes.
// -------------------------------
let _isRefreshing = false;
let _refreshQueue = []; // [{ resolve, reject }]

function _processQueue(error) {
  _refreshQueue.forEach(({ resolve, reject }) => (error ? reject(error) : resolve()));
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
    // 401 → Try refresh via httpOnly cookie
    // -------------------------------
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Another refresh is already in flight — queue this request
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        })
          .then(() => apiClient(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        // Send no body — the refresh_token httpOnly cookie is attached automatically
        await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {}, { withCredentials: true });

        _isRefreshing = false;
        _processQueue(null);

        // Retry original request — new access_token cookie is now set
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('🔒 Token refresh failed:', refreshError);

        _isRefreshing = false;
        _processQueue(refreshError);

        // Don't wipe localStorage here. authStore.checkAuthentication() already
        // clears storage and triggers logout when session is truly dead. Clearing
        // 'id' / 'expiresAt' here causes spurious logouts when the refresh cookie
        // isn't yet propagated across ports in test environments.
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
