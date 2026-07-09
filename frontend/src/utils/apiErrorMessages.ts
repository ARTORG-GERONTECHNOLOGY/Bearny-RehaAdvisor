type ErrorMessageOptions = {
  fallback: string;
  payloadTooLarge: string;
  network: string;
  timeout: string;
  server: string;
  unauthorized?: string;
  forbidden?: string;
};

// Pulls the backend's own message out of a response body, or '' if there isn't one.
export function extractBackendMessage(data: unknown): string {
  if (!data) return '';
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed || /^</.test(trimmed)) return '';
    return trimmed;
  }
  if (typeof data !== 'object') return '';

  const maybeData = data as Record<string, unknown>;
  for (const key of ['error', 'message', 'detail', 'details']) {
    const value = maybeData[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

// Backend message, else err.message, else the given fallback — a plain error string.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const err = error as { message?: string; response?: { data?: unknown } };
  const backendMessage = extractBackendMessage(err?.response?.data);
  if (backendMessage) return backendMessage;
  return err?.message || fallback;
}

// Backend message, else a friendly message picked by status code from options.
export function getFriendlyApiErrorMessage(error: unknown, options: ErrorMessageOptions): string {
  const err = error as {
    code?: string;
    message?: string;
    response?: {
      status?: number;
      data?: unknown;
    };
  };

  const backendMessage = extractBackendMessage(err?.response?.data);
  if (backendMessage) return backendMessage;

  const status = err?.response?.status;
  const message = err?.message || '';
  const isTimeout = err?.code === 'ECONNABORTED' || /timeout|timed out/i.test(message || '');

  if (status === 413) return options.payloadTooLarge;
  if (isTimeout || status === 408) return options.timeout;
  if (!err?.response) return options.network;
  if (status === 401 && options.unauthorized) return options.unauthorized;
  if (status === 403 && options.forbidden) return options.forbidden;
  if (typeof status === 'number' && status >= 500) return options.server;
  if (typeof status === 'number') return `${options.fallback} (HTTP ${status})`;
  return options.fallback;
}
