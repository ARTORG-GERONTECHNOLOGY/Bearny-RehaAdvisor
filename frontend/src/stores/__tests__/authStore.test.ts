import '@testing-library/jest-dom';

describe('authStore (MobX)', () => {
  const SESSION_TIMEOUT = 15 * 60 * 1000; // must match store
  const NOW = 1_000; // deterministic time baseline

  let apiPost: jest.Mock;
  let apiGet: jest.Mock;

  function setLS(items: Record<string, string>) {
    Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, v));
  }

  function clearLS() {
    localStorage.clear();
  }

  async function importFreshStore() {
    // Important for singleton stores: reset module cache then import
    jest.resetModules();
    const mod = await import('../authStore');
    return mod.default;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);

    clearLS();

    // Mock apiClient per test (after resetModules it will be re-evaluated)
    apiPost = jest.fn();
    apiGet = jest.fn();

    jest.doMock('../../api/client', () => ({
      __esModule: true,
      default: {
        post: (...args: any[]) => apiPost(...args),
        get: (...args: any[]) => apiGet(...args),
      },
    }));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    (Date.now as jest.Mock).mockRestore?.();
    jest.dontMock('../../api/client');
  });

  test('loginWithHttp: successful login (no 2FA) stores tokens, authenticates, fetches profile', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        user_type: 'Patient',
        id: '1',
        access_token: 'access123',
        refresh_token: 'refresh123',
        require_2fa: false,
      },
    });

    apiGet.mockResolvedValueOnce({
      data: {
        first_name: 'Ada',
        // backend might send specialisation as string or array; store parses both
        specialisation: 'Ortho,Cardio',
      },
    });

    const store = await importFreshStore();

    store.setEmail('p@x.com');
    store.setPassword('pw');

    await store.loginWithHttp();

    expect(store.isAuthenticated).toBe(true);
    expect(store.partialLogin).toBe(false);
    expect(store.userType).toBe('Patient');
    expect(store.id).toBe('1');

    expect(localStorage.getItem('authToken')).toBe('access123');
    expect(localStorage.getItem('refreshToken')).toBe('refresh123');
    expect(localStorage.getItem('userType')).toBe('Patient');
    expect(localStorage.getItem('id')).toBe('1');

    // inactivity marks expiresAt and lastActivity
    const expiresAt = Number(localStorage.getItem('expiresAt'));
    expect(expiresAt).toBe(NOW + SESSION_TIMEOUT);

    // profile fetched & stored
    expect(apiGet).toHaveBeenCalledWith('/auth/get-user-info/1/');
    expect(store.firstName).toBe('Ada');
    expect(store.specialisations).toEqual(['Ortho', 'Cardio']);
  });

  test('loginWithHttp: therapist login requiring 2FA sets partialLogin true and does NOT store tokens', async () => {
    apiPost.mockResolvedValueOnce({
      data: {
        user_type: 'Therapist',
        id: '2',
        require_2fa: true,
      },
    });

    const store = await importFreshStore();

    store.setEmail('t@x.com');
    store.setPassword('pw');

    await store.loginWithHttp();

    expect(store.partialLogin).toBe(true);
    expect(store.isAuthenticated).toBe(false);
    expect(store.userType).toBe('Therapist');
    expect(store.id).toBe('2');

    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();

    // identity should still be persisted early
    expect(localStorage.getItem('userType')).toBe('Therapist');
    expect(localStorage.getItem('id')).toBe('2');
  });

  test('loginWithHttp: failure sets loginErrorMessage and clears auth flags', async () => {
    apiPost.mockRejectedValueOnce({
      response: { data: { error: 'Invalid credentials' } },
    });

    const store = await importFreshStore();
    store.setEmail('x@x.com');
    store.setPassword('bad');

    await store.loginWithHttp();

    expect(store.isAuthenticated).toBe(false);
    expect(store.partialLogin).toBe(false);
    expect(store.loginErrorMessage).toBe('Invalid credentials');
  });

  test('complete2FA: stores tokens, authenticates, fetches profile', async () => {
    apiGet.mockResolvedValueOnce({
      data: { first_name: 'Thera', specialisations: ['Neuro'] },
    });

    const store = await importFreshStore();
    store.setId('2');

    await store.complete2FA('a2', 'r2');

    expect(store.partialLogin).toBe(false);
    expect(store.isAuthenticated).toBe(true);

    expect(localStorage.getItem('authToken')).toBe('a2');
    expect(localStorage.getItem('refreshToken')).toBe('r2');
    expect(localStorage.getItem('id')).toBe('2');

    expect(apiGet).toHaveBeenCalledWith('/auth/get-user-info/2/');
    expect(store.firstName).toBe('Thera');
    expect(store.specialisations).toEqual(['Neuro']);
  });

  test('checkAuthentication: valid session restores identity and authenticates', async () => {
    setLS({
      authToken: 'tok',
      refreshToken: 'ref',
      expiresAt: String(NOW + 10_000),
      userType: 'Admin',
      id: '99',
      firstName: 'Root',
      specialisations: 'A,B',
    });

    const store = await importFreshStore();

    // constructor calls checkAuthentication on init
    expect(store.isAuthenticated).toBe(true);
    expect(store.userType).toBe('Admin');
    expect(store.id).toBe('99');
    expect(store.firstName).toBe('Root');
    expect(store.specialisations).toEqual(['A', 'B']);
  });

  test('checkAuthentication: expired session resets and clears storage but preserves i18nextLng', async () => {
    setLS({
      i18nextLng: 'de',
      authToken: 'tok',
      expiresAt: String(NOW - 1), // expired
      userType: 'Patient',
      id: '1',
    });

    const store = await importFreshStore();

    expect(store.isAuthenticated).toBe(false);
    expect(store.userType).toBe('');
    expect(store.id).toBe('');

    // storage cleared except language
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('userType')).toBeNull();
    expect(localStorage.getItem('id')).toBeNull();
    expect(localStorage.getItem('i18nextLng')).toBe('de');
  });

  test('setTokens writes expiresAt correctly', async () => {
    const store = await importFreshStore();

    store.setUserType('Patient');
    store.setId('1');
    store.setTokens('a', 'r');

    expect(localStorage.getItem('authToken')).toBe('a');
    expect(localStorage.getItem('refreshToken')).toBe('r');

    const expiresAt = Number(localStorage.getItem('expiresAt'));
    expect(expiresAt).toBe(NOW + SESSION_TIMEOUT);
  });

  test('_armTimeoutFromStorage: schedules logout when session expires', async () => {
    const store = await importFreshStore();

    // Spy and prevent actual logout side-effects
    const logoutSpy = jest.spyOn(store, 'logout').mockResolvedValue(undefined);

    localStorage.setItem('expiresAt', String(NOW + 50));
    (store as any)._armTimeoutFromStorage();

    jest.advanceTimersByTime(60);

    expect(logoutSpy).toHaveBeenCalled();

    logoutSpy.mockRestore();
  });

  test('storage event: clearing authToken in another tab resets store and removes listeners', async () => {
    const store = await importFreshStore();

    // Make store look authenticated
    store.setUserType('Patient');
    store.setId('1');
    store.setTokens('tok', 'ref');
    store.checkAuthentication();

    expect(store.isAuthenticated).toBe(true);

    // Simulate token cleared in another tab
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'authToken',
        oldValue: 'tok',
        newValue: null,
      })
    );

    expect(store.isAuthenticated).toBe(false);
    expect(store.userType).toBe('');
    expect(store.id).toBe('');
  });

  test('logout: clears tokens, preserves i18nextLng, calls onLogoutCallback, best-effort POST', async () => {
    apiPost.mockResolvedValueOnce({ status: 200 });

    const store = await importFreshStore();

    // simulate session
    localStorage.setItem('i18nextLng', 'en');
    store.setUserType('Patient');
    store.setId('1');
    store.setTokens('tok', 'ref');

    const cb = jest.fn();
    store.setOnLogoutCallback(cb);

    await store.logout();

    // audit call
    expect(apiPost).toHaveBeenCalledWith('/auth/logout/', { userId: '1' });

    // state reset
    expect(store.isAuthenticated).toBe(false);
    expect(store.userType).toBe('');
    expect(store.id).toBe('');

    // storage cleared except language
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('i18nextLng')).toBe('en');

    expect(cb).toHaveBeenCalled();
  });
});

test('fetchAndStoreUserInfo: parses specialisations from array AND from comma-string payloads', async () => {
  const store = await importFreshStore();
  store.setId('77');

  // Case 1: array
  apiGet.mockResolvedValueOnce({
    data: { first_name: 'Alice', specialisations: ['Neuro', ' Ortho '] },
  });

  await store.fetchAndStoreUserInfo('77');

  expect(store.firstName).toBe('Alice');
  expect(store.specialisations).toEqual(['Neuro', 'Ortho']);

  // Case 2: comma string
  apiGet.mockResolvedValueOnce({
    data: { first_name: 'Bob', specialisation: 'Cardio, Pulmo ,  ' },
  });

  await store.fetchAndStoreUserInfo('77');

  expect(store.firstName).toBe('Bob');
  expect(store.specialisations).toEqual(['Cardio', 'Pulmo']);
});
test('_armTimeoutFromStorage: corrupted expiresAt triggers safe logout', async () => {
  const store = await importFreshStore();

  const logoutSpy = jest.spyOn(store, 'logout').mockResolvedValue(undefined);

  // Corrupt storage (non-numeric)
  localStorage.setItem('expiresAt', 'not-a-number');

  (store as any)._armTimeoutFromStorage();

  expect(logoutSpy).toHaveBeenCalled();

  logoutSpy.mockRestore();
});
test('checkAuthentication: expiresAt present but missing authToken resets and clears storage (preserves i18nextLng)', async () => {
  // No authToken, but expiresAt is valid/future
  localStorage.setItem('i18nextLng', 'de');
  localStorage.setItem('expiresAt', String(NOW + 10_000));
  localStorage.setItem('userType', 'Patient');
  localStorage.setItem('id', '1');

  const store = await importFreshStore();

  expect(store.isAuthenticated).toBe(false);
  expect(store.userType).toBe('');
  expect(store.id).toBe('');

  // cleared (except language)
  expect(localStorage.getItem('expiresAt')).toBeNull();
  expect(localStorage.getItem('userType')).toBeNull();
  expect(localStorage.getItem('id')).toBeNull();
  expect(localStorage.getItem('i18nextLng')).toBe('de');
});
