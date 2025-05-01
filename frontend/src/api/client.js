import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL;

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

// Handle global response errors (especially 401)
apiClient.interceptors.response.use(
  (response) => response, // Pass through successful responses
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // prevent infinite retry loop

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token available');

        const res = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = res.data?.access;
        if (!newAccessToken) throw new Error('Refresh token did not return a new access token');

        // Save new token
        localStorage.setItem('authToken', newAccessToken);

        // Retry the failed request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Optional: redirect to login or trigger logout
      }
    }

    // Other errors
    return Promise.reject(error);
  }
);

export default apiClient;
