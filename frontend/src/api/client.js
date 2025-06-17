import axios from 'axios';

axios.defaults.xsrfCookieName = 'csrftoken';
axios.defaults.xsrfHeaderName = 'X-CSRFToken';

const API_BASE_URL = import.meta.env.VITE_API_URL;
console.log('VITE_API_URL:', import.meta.env.VITE_API_URL);

// Create a reusable Axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatically attach auth token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`; // Standard JWT format
  }
  return config;
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('You have been logged out. Please log in again.');

        const res = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = res.data?.access;
        if (!newAccessToken) throw new Error('Unable to refresh session. Please log in again.');

        localStorage.setItem('authToken', newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('🔒 Token refresh failed:', refreshError);

        // Optional: show error to user or redirect
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    }

    // Other errors: standardize error format
    const fallbackMsg = 'An unexpected error occurred.';
    const message =
      error.response?.data?.error || error.response?.data?.message || error.message || fallbackMsg;

    console.error('❌ API Error:', message);
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
