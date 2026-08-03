export type UnknownRecord = Record<string, unknown>;

export const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;

export const isString = (v: unknown): v is string => typeof v === 'string';

// Coerces to an indexable object (including arrays), or {} if `v` isn't one.
export const asRecord = (v: unknown): UnknownRecord => (isRecord(v) ? v : {});

// Coerces to a string, or `fallback` (default '') if `v` isn't one.
export const asString = (v: unknown, fallback = ''): string => (isString(v) ? v : fallback);

// Coerces to an array, or [] if `v` isn't one.
export const asArray = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// Like asArray, but also wraps a bare non-array object into a single-element array —
// for payloads that can come back as either a list or a lone object for the same field.
export const asArrayOrWrap = <T = unknown>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (!v) return [];
  if (typeof v === 'object') return [v as T];
  return [];
};
