// src/api/client.js
import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api', // Use the proxy path (through Nginx) to hit the backend API
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: Add interceptors for requests or responses
apiClient.interceptors.request.use((config) => {
  // You can attach tokens or manipulate config here
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors here, e.g., refresh tokens, redirect to login
    return Promise.reject(error);
  }
);

export default apiClient;
