import { SessionCache } from '@/utils/sessionCache';

const KEY = 'test-store';

beforeEach(() => sessionStorage.clear());

describe('SessionCache.get', () => {
  it('returns null when nothing is stored', () => {
    const cache = new SessionCache(KEY);
    expect(cache.get('foo')).toBeNull();
  });

  it('returns the stored value', () => {
    const cache = new SessionCache(KEY);
    cache.set('foo', { value: 42 });
    expect(cache.get('foo')).toEqual({ value: 42 });
  });

  it('returns null for a missing cache key', () => {
    const cache = new SessionCache(KEY);
    cache.set('foo', 'bar');
    expect(cache.get('missing')).toBeNull();
  });

  it('returns null when sessionStorage contains invalid JSON (covers catch branch)', () => {
    sessionStorage.setItem(KEY, 'not-valid-json');
    const cache = new SessionCache(KEY);
    expect(cache.get('foo')).toBeNull();
  });
});

describe('SessionCache.set', () => {
  it('stores and retrieves multiple keys', () => {
    const cache = new SessionCache(KEY);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('overwrites an existing key', () => {
    const cache = new SessionCache(KEY);
    cache.set('a', 'old');
    cache.set('a', 'new');
    expect(cache.get('a')).toBe('new');
  });

  it('starts fresh when stored value is corrupted JSON', () => {
    sessionStorage.setItem(KEY, 'not-valid-json');
    const cache = new SessionCache(KEY);
    cache.set('x', 99);
    expect(cache.get('x')).toBe(99);
  });

  it('starts fresh when stored value is a JSON array (not an object)', () => {
    sessionStorage.setItem(KEY, JSON.stringify([1, 2, 3]));
    const cache = new SessionCache(KEY);
    cache.set('x', 99);
    expect(cache.get('x')).toBe(99);
  });
});

describe('SessionCache.remove', () => {
  it('removes a specific key', () => {
    const cache = new SessionCache(KEY);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.remove('a');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe(2);
  });

  it('does nothing when storage key does not exist', () => {
    const cache = new SessionCache(KEY);
    expect(() => cache.remove('foo')).not.toThrow();
  });

  it('does nothing when cache key does not exist', () => {
    const cache = new SessionCache(KEY);
    cache.set('a', 1);
    expect(() => cache.remove('missing')).not.toThrow();
    expect(cache.get('a')).toBe(1);
  });
});

describe('SessionCache.clear', () => {
  it('removes all stored data', () => {
    const cache = new SessionCache(KEY);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('does not throw when nothing is stored', () => {
    const cache = new SessionCache(KEY);
    expect(() => cache.clear()).not.toThrow();
  });
});
