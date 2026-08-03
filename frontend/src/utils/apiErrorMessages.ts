type ApiErrorResponseData = {
  message?: unknown;
  error?: unknown;
  detail?: unknown;
  details?: unknown;
  field_errors?: unknown;
  non_field_errors?: unknown;
};

type ApiErrorLike = {
  response?: { data?: ApiErrorResponseData };
  message?: unknown;
};

type ErrorMessageOptions = {
  fallback: string;
  payloadTooLarge: string;
  network: string;
  timeout: string;
  server: string;
  unauthorized?: string;
  forbidden?: string;
};

export const toStr = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

const joinArray = (v: unknown): string =>
  Array.isArray(v)
    ? v
        .map((x) => toStr(x))
        .filter(Boolean)
        .join(' ')
    : '';

const fieldErrorsToText = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '';
  return Object.entries(v as Record<string, unknown>)
    .map(([field, msgs]) => {
      if (Array.isArray(msgs)) return msgs.map((m) => `${field}: ${toStr(m)}`).join(' ');
      if (msgs) return `${field}: ${toStr(msgs)}`;
      return '';
    })
    .filter(Boolean)
    .join(' ');
};

// Concatenates every message-shaped field found on the backend error payload into one string.
export const extractApiError = (e: unknown, fallback: string): string => {
  const err = e as ApiErrorLike;
  const api = err?.response?.data;

  if (!api) return fallback;

  const pieces: string[] = [];

  const msg = toStr(api.message).trim();
  if (msg) pieces.push(msg);

  const nonField = joinArray(api.non_field_errors).trim();
  if (nonField) pieces.push(nonField);

  const fieldText = fieldErrorsToText(api.field_errors).trim();
  if (fieldText) pieces.push(fieldText);

  const apiErr = toStr(api.error).trim();
  if (apiErr) pieces.push(apiErr);

  const details = toStr(api.details ?? api.detail).trim();
  if (details) pieces.push(details);

  const text = pieces.join(' ').trim();
  return text || fallback;
};

// Like extractApiError, but keeps the field/non-field error text as a separate
// `details` string instead of folding it into `message` — for UIs with a
// collapsible "show details" affordance.
export const extractApiErrorWithDetails = (
  e: unknown,
  fallback: string
): { message: string; details: string | null } => {
  const err = e as ApiErrorLike;
  const api = err?.response?.data;

  const nonField = joinArray(api?.non_field_errors).trim();
  const fieldText = fieldErrorsToText(api?.field_errors).trim();

  const message =
    toStr(api?.message).trim() ||
    toStr(api?.error).trim() ||
    toStr(api?.detail).trim() ||
    nonField ||
    toStr(err?.message).trim() ||
    fallback;

  const details =
    typeof api?.details === 'string'
      ? api.details
      : api?.details != null
        ? toStr(api.details)
        : fieldText || null;

  return { message: String(message), details: details ? String(details) : null };
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
