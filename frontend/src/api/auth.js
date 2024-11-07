// src/api/auth.js
import apiClient from './client';

// Login user
export const login = (credentials) => {
  return apiClient.post('/auth/login/', credentials);
};

// Signup user
export const signup = (userData) => {
  return apiClient.post('/auth/signup/', userData);
};

// Logout user
export const logout = () => {
  return apiClient.post('/auth/logout/');
};
