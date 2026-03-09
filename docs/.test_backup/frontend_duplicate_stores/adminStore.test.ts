describe('adminStore', () => {
  let apiGet: jest.Mock;
  let apiPost: jest.Mock;

  async function importFreshAdminStore() {
    jest.resetModules();
    const mod = await import('@/stores/adminStore');
    return mod.default;
  }

  beforeEach(() => {
    apiGet = jest.fn();
    apiPost = jest.fn();

    jest.doMock('@/api/client', () => ({
      __esModule: true,
      default: {
        get: (...args: any[]) => apiGet(...args),
        post: (...args: any[]) => apiPost(...args),
      },
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.dontMock('@/api/client');
  });

  it('fetchPendingEntries: success maps response.data.pending_users into pendingEntries', async () => {
    apiGet.mockResolvedValueOnce({
      data: {
        pending_users: [
          { id: '1', role: 'Therapist', email: 't@x.com' },
          { id: '2', role: 'Researcher', email: 'r@x.com' },
        ],
      },
    });

    const store = await importFreshAdminStore();
    await store.fetchPendingEntries();

    expect(apiGet).toHaveBeenCalledWith('/admin/pending-users');
    expect(store.pendingEntries).toHaveLength(2);
    expect(store.pendingEntries[0].id).toBe('1');
    expect(store.error).toBe('');
  });

  it('fetchPendingEntries: failure sets a user-friendly error message', async () => {
    apiGet.mockRejectedValueOnce(new Error('network'));

    const store = await importFreshAdminStore();
    await store.fetchPendingEntries();

    expect(store.pendingEntries).toEqual([]);
    expect(store.error).toBe('Failed to fetch pending entries. Please try again later.');
  });

  it('acceptEntry: posts to accept endpoint and refreshes pending entries', async () => {
    apiPost.mockResolvedValueOnce({ status: 200 });
    apiGet.mockResolvedValueOnce({ data: { pending_users: [] } });

    const store = await importFreshAdminStore();

    const fetchSpy = jest.spyOn(store, 'fetchPendingEntries');
    await store.acceptEntry('123');

    expect(apiPost).toHaveBeenCalledWith('/admin/accept-user/', { userId: '123' });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('acceptEntry: failure sets error message', async () => {
    apiPost.mockRejectedValueOnce(new Error('fail'));

    const store = await importFreshAdminStore();
    await store.acceptEntry('123');

    expect(store.error).toBe('Failed to accept entry. Please try again later.');
  });

  it('declineEntry: posts to decline endpoint and refreshes pending entries', async () => {
    apiPost.mockResolvedValueOnce({ status: 200 });
    apiGet.mockResolvedValueOnce({ data: { pending_users: [] } });

    const store = await importFreshAdminStore();

    const fetchSpy = jest.spyOn(store, 'fetchPendingEntries');
    await store.declineEntry('123');

    expect(apiPost).toHaveBeenCalledWith('/admin/decline-user/', { userId: '123' });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('declineEntry: failure sets error message', async () => {
    apiPost.mockRejectedValueOnce(new Error('fail'));

    const store = await importFreshAdminStore();
    await store.declineEntry('123');

    expect(store.error).toBe('Failed to decline entry. Please try again later.');
  });
});
