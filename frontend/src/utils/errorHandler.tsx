import { AxiosError } from 'axios';
import authStore from '../stores/authStore';

const handleApiError = (error: AxiosError, store: typeof authStore) => {
  if (error.response && error.response.data) {
    store.setLoginError(`Login failed: ${error.response.data.message}`);
  } else {
    store.setLoginError('Connection error.');
  }
};

export default handleApiError;
