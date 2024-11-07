// utils/errorHandler.ts
import { AxiosError } from 'axios';
import authStore from '../stores/authStore';

const handleApiError = (error: AxiosError | any, store: typeof authStore) => {
  if (error.response) {
    store.setLoginError(`Login failed: ${error.response.data.message}`);
  } else {
    store.setLoginError('Connection error.');
  }
};

export default handleApiError;
