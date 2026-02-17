describe('ForgotPasswordStore', () => {
  let apiPost: jest.Mock;

  async function importFresh() {
    jest.resetModules();
    const mod = await import('../forgotPasswordStore');
    return mod.ForgotPasswordStore;
  }

  const t = (k: string) => k;

  beforeEach(() => {
    apiPost = jest.fn();

    jest.doMock('../../api/client', () => ({
      __esModule: true,
      default: {
        post: (...args: any[]) => apiPost(...args),
      },
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.dontMock('../../api/client');
  });

  it('setEmail sets email state', async () => {
    const Store = await importFresh();
    const store = new Store();

    store.setEmail('x@y.com');
    expect(store.email).toBe('x@y.com');
  });

  it('submit: invalid email sets error and stops loading without calling API', async () => {
    const Store = await importFresh();
    const store = new Store();

    store.setEmail('not-an-email');
    await store.submit(t);

    expect(apiPost).not.toHaveBeenCalled();
    expect(store.loading).toBe(false);
    expect(store.success).toBe(false);
    expect(store.error).toBe('Invalid email format.');
  });

  it('submit: trims email and calls API with correct payload', async () => {
    apiPost.mockResolvedValueOnce({ status: 200 });

    const Store = await importFresh();
    const store = new Store();

    store.setEmail('  test@example.com  ');
    await store.submit(t);

    expect(apiPost).toHaveBeenCalledWith('auth/forgot-password/', { email: 'test@example.com' });
    expect(store.success).toBe(true);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('submit: API failure sets user-friendly error message', async () => {
    apiPost.mockRejectedValueOnce(new Error('network'));

    const Store = await importFresh();
    const store = new Store();

    store.setEmail('test@example.com');
    await store.submit(t);

    expect(store.success).toBe(false);
    expect(store.error).toBe('Failed to send password reset link. Please try again.');
    expect(store.loading).toBe(false);
  });

  it('submit: clears previous messages on each attempt', async () => {
    apiPost.mockResolvedValueOnce({ status: 200 });

    const Store = await importFresh();
    const store = new Store();

    store.error = 'old error';
    store.success = true;

    store.setEmail('test@example.com');
    await store.submit(t);

    expect(store.error).toBeNull();
    expect(store.success).toBe(true); // success set again by API
    expect(store.loading).toBe(false);
  });

  it('submit: sets loading true immediately and false in finally', async () => {
    let resolvePost: (v: any) => void = () => {};
    const deferred = new Promise((res) => (resolvePost = res));
    apiPost.mockReturnValueOnce(deferred);

    const Store = await importFresh();
    const store = new Store();

    store.setEmail('test@example.com');

    const p = store.submit(t);

    // should be loading while promise pending
    expect(store.loading).toBe(true);

    resolvePost({ status: 200 });
    await p;

    expect(store.loading).toBe(false);
    expect(store.success).toBe(true);
  });
});
