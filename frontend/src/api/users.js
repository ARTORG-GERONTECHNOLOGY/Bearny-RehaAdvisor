// src/api/users.js
import apiClient from './client';

// Fetch list of users
export const fetchUsers = () => {
  return apiClient.get('/users/');
};

// Fetch a specific user by ID
export const fetchUserById = (id) => {
  return apiClient.get(`/users/${id}/`);
};

// Create a new user
export const createUser = (userData) => {
  return apiClient.post('/users/', userData);
};

// Update an existing user
export const updateUser = (id, userData) => {
  return apiClient.put(`/users/${id}/`, userData);
};

// Delete a user
export const deleteUser = (id) => {
  return apiClient.delete(`/users/${id}/`);
};

// Fetch user profile
export const getUserProfile = async (id) => {
  const response = await apiClient.get(`users/${id}/profile`);
  return response.data;
};

// Update user profile
export const updateUserProfile = async (userData) => {
  const response = await apiClient.put('/users/profile/', userData);
  return response.data;
};

// Delete user account
export const deleteUserAccount = async () => {
  await apiClient.delete('/users/profile/');
};
