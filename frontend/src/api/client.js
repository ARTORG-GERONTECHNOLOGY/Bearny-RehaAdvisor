import axios from 'axios';

// Create Axios instance
const apiClient = axios.create({
  baseURL: 'http://159.100.246.89:8000/api', // Proxy API requests via Nginx
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken'); // Or use cookies
  if (token) {
    config.headers.Authorization = `Token ${token}`; // Or `Bearer ${token}` for JWT
  }
  return config;
});

// Handle errors globally
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const refreshResponse = await apiClient.post('/api/auth/token/refresh/', {
          refresh: localStorage.getItem('refreshToken'),
        });
        const newAccessToken = refreshResponse.data.access;
        localStorage.setItem('accessToken', newAccessToken);

        // Retry the failed request
        error.config.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return apiClient(error.config);
      } catch (refreshError) {
        console.error('Token refresh failed');
      }
    }
    return Promise.reject(error);
  }
);


export default apiClient;
