import {
  getApiErrorMessage,
  extractBackendMessage,
  getFriendlyApiErrorMessage,
} from '@/utils/apiErrorMessages';

describe('getApiErrorMessage', () => {
  it('prefers the backend "error" field over err.message and the fallback', () => {
    const err = { response: { data: { error: 'Backend said no' } }, message: 'Network Error' };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('Backend said no');
  });

  it('checks message/detail/details in order when "error" is absent', () => {
    expect(getApiErrorMessage({ response: { data: { message: 'msg' } } }, 'Failed.')).toBe('msg');
    expect(getApiErrorMessage({ response: { data: { detail: 'det' } } }, 'Failed.')).toBe('det');
    expect(getApiErrorMessage({ response: { data: { details: 'dets' } } }, 'Failed.')).toBe('dets');
  });

  it('falls back to err.message when the backend sent no usable message', () => {
    const err = { message: 'timeout of 5000ms exceeded' };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('timeout of 5000ms exceeded');
  });

  it('falls back to the provided fallback when nothing else is available', () => {
    expect(getApiErrorMessage({}, 'Failed to save.')).toBe('Failed to save.');
    expect(getApiErrorMessage(null, 'Failed to save.')).toBe('Failed to save.');
    expect(getApiErrorMessage(undefined, 'Failed to save.')).toBe('Failed to save.');
  });

  it('ignores a backend data string that looks like an HTML error page', () => {
    const err = { response: { data: '<html>502 Bad Gateway</html>' }, message: 'Network Error' };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('Network Error');
  });

  it('accepts a plain trimmed string as the backend data', () => {
    const err = { response: { data: '  Quota exceeded  ' } };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('Quota exceeded');
  });

  it('skips blank or non-string backend fields and falls through to err.message', () => {
    const err = { response: { data: { error: '   ', message: 42 } }, message: 'Boom' };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('Boom');
  });

  it('ignores backend data that is neither a string nor an object', () => {
    const err = { response: { data: 502 }, message: 'Network Error' };
    expect(getApiErrorMessage(err, 'Failed.')).toBe('Network Error');
  });
});

describe('extractBackendMessage', () => {
  it('extracts the message field, with no fallback for missing data', () => {
    expect(extractBackendMessage({ error: 'invalid_credentials' })).toBe('invalid_credentials');
  });

  it('returns an empty string when there is no usable field, without looking at err.message', () => {
    expect(extractBackendMessage({})).toBe('');
  });

  it('returns an empty string for null/undefined data', () => {
    expect(extractBackendMessage(null)).toBe('');
    expect(extractBackendMessage(undefined)).toBe('');
  });
});

describe('getFriendlyApiErrorMessage', () => {
  const options = {
    fallback: 'Something went wrong.',
    payloadTooLarge: 'File is too large.',
    network: 'Network error, check your connection.',
    timeout: 'Request timed out.',
    server: 'Server error, try again later.',
    unauthorized: 'Please log in again.',
    forbidden: 'You do not have access.',
  };

  it('prefers a backend-provided message over any status-based mapping', () => {
    const err = { response: { status: 500, data: { error: 'Disk full' } } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Disk full');
  });

  it('maps HTTP 413 to the payloadTooLarge message', () => {
    const err = { response: { status: 413, data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('File is too large.');
  });

  it('maps an ECONNABORTED code to the timeout message', () => {
    const err = { code: 'ECONNABORTED', message: 'timeout of 5000ms exceeded' };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Request timed out.');
  });

  it('maps a message containing "timed out" to the timeout message', () => {
    const err = { message: 'connection timed out' };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Request timed out.');
  });

  it('maps HTTP 408 to the timeout message', () => {
    const err = { response: { status: 408, data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Request timed out.');
  });

  it('maps a missing response (network error) to the network message', () => {
    const err = { message: 'Network Error' };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Network error, check your connection.');
  });

  it('maps HTTP 401 to the unauthorized message when provided', () => {
    const err = { response: { status: 401, data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Please log in again.');
  });

  it('falls through to the generic status message when unauthorized is not configured', () => {
    const err = { response: { status: 401, data: {} } };
    const { unauthorized, ...noUnauthorized } = options;
    expect(getFriendlyApiErrorMessage(err, noUnauthorized)).toBe(
      'Something went wrong. (HTTP 401)'
    );
  });

  it('maps HTTP 403 to the forbidden message when provided', () => {
    const err = { response: { status: 403, data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('You do not have access.');
  });

  it('maps any 5xx status to the server message', () => {
    expect(getFriendlyApiErrorMessage({ response: { status: 502, data: {} } }, options)).toBe(
      'Server error, try again later.'
    );
    expect(getFriendlyApiErrorMessage({ response: { status: 599, data: {} } }, options)).toBe(
      'Server error, try again later.'
    );
  });

  it('appends the HTTP status to the fallback for other numeric statuses', () => {
    const err = { response: { status: 422, data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Something went wrong. (HTTP 422)');
  });

  it('returns the plain fallback when there is a response but no usable status', () => {
    const err = { response: { data: {} } };
    expect(getFriendlyApiErrorMessage(err, options)).toBe('Something went wrong.');
  });
});
