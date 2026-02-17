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
// RESPONSE INTERCEPTOR (FIXED)
// -------------------------------
apiClient.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;

    // -------------------------------
    // 401 → Try refresh token
    // -------------------------------
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          console.warn('No refresh token found.');
          return Promise.reject(error); // keep original error
        }

        const refreshRes = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = refreshRes.data?.access;
        if (!newAccessToken) {
          console.warn('Refresh token response missing access token.');
          return Promise.reject(error);
        }

        // Save new access token
        localStorage.setItem('authToken', newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        // Retry original request with updated token
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('🔒 Token refresh failed:', refreshError);

        // Logout user, but DO NOT destroy Axios error structure
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
