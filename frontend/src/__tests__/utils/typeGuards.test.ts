import { isRecord, isString, asRecord, asString, asArray, asArrayOrWrap } from '@/utils/typeGuards';

describe('isRecord', () => {
  it('returns true for plain objects and arrays', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord([])).toBe(true);
  });

  it('returns false for null, primitives, and undefined', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe('isString', () => {
  it('returns true only for strings', () => {
    expect(isString('hello')).toBe(true);
    expect(isString('')).toBe(true);
  });

  it('returns false for non-strings', () => {
    expect(isString(42)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
    expect(isString({})).toBe(false);
  });
});

describe('asRecord', () => {
  it('returns the value when it is a record', () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it('returns {} for null, undefined, and primitives', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
    expect(asRecord('nope')).toEqual({});
  });
});

describe('asString', () => {
  it('returns the value when it is a string', () => {
    expect(asString('hello')).toBe('hello');
  });

  it('returns the default fallback ("") for non-strings', () => {
    expect(asString(42)).toBe('');
    expect(asString(null)).toBe('');
    expect(asString(undefined)).toBe('');
  });

  it('returns a custom fallback when provided', () => {
    expect(asString(null, 'fallback')).toBe('fallback');
  });
});

describe('asArray', () => {
  it('returns the array unchanged', () => {
    expect(asArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns [] for non-arrays, including a bare object', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
    expect(asArray('nope')).toEqual([]);
    expect(asArray({ a: 1 })).toEqual([]);
  });
});

describe('asArrayOrWrap', () => {
  it('returns the array unchanged', () => {
    expect(asArrayOrWrap([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('wraps a bare object into a single-element array', () => {
    expect(asArrayOrWrap({ a: 1 })).toEqual([{ a: 1 }]);
  });

  it('returns [] for null, undefined, and non-object primitives', () => {
    expect(asArrayOrWrap(null)).toEqual([]);
    expect(asArrayOrWrap(undefined)).toEqual([]);
    expect(asArrayOrWrap('nope')).toEqual([]);
    expect(asArrayOrWrap(0)).toEqual([]);
  });
});
