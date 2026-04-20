import { AxiosError } from 'axios';
import handleApiError from '@/utils/errorHandler';

const makeStore = () => ({ setLoginError: jest.fn() });

const makeAxiosError = (responseData?: object): AxiosError => {
  const error = new AxiosError('Request failed');
  if (responseData !== undefined) {
    error.response = {
      data: responseData,
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as any,
    };
  }
  return error;
};

describe('handleApiError', () => {
  it('sets login error with message from response data', () => {
    const store = makeStore();
    const error = makeAxiosError({ message: 'Invalid credentials' });

    handleApiError(error, store as any);

    expect(store.setLoginError).toHaveBeenCalledWith('Login failed: Invalid credentials');
  });

  it('sets connection error when there is no response', () => {
    const store = makeStore();
    const error = makeAxiosError();

    handleApiError(error, store as any);

    expect(store.setLoginError).toHaveBeenCalledWith('Connection error.');
  });

  it('sets connection error when response has no data', () => {
    const store = makeStore();
    const error = makeAxiosError();
    error.response = undefined;

    handleApiError(error, store as any);

    expect(store.setLoginError).toHaveBeenCalledWith('Connection error.');
  });
});
