describe('AdminDashboardStore', () => {
  async function importFreshClass() {
    jest.resetModules();
    const mod = await import('../adminDashboardStore');
    return mod.AdminDashboardStore;
  }

  const t = (k: string) => k;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.doMock('../authStore', () => ({
      __esModule: true,
      default: {
        isAuthenticated: true,
        userType: 'Admin',
        checkAuthentication: jest.fn(async () => {}),
      },
    }));

    jest.doMock('../adminStore', () => ({
      __esModule: true,
      default: {
        pendingEntries: [],
        fetchPendingEntries: jest.fn(async () => {}),
        acceptEntry: jest.fn(async () => {}),
        declineEntry: jest.fn(async () => {}),
      },
    }));
  });

  afterEach(() => {
    jest.dontMock('../authStore');
    jest.dontMock('../adminStore');
  });

  it('init: redirects to /unauthorized if not authenticated or not Admin', async () => {
    // override authStore mock for this test
    jest.doMock('../authStore', () => ({
      __esModule: true,
      default: {
        isAuthenticated: false,
        userType: 'Patient',
        checkAuthentication: jest.fn(async () => {}),
      },
    }));

    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    const navigate = jest.fn();
    await store.init(navigate, t);

    expect(navigate).toHaveBeenCalledWith('/unauthorized');
    expect(store.loading).toBe(false);
  });

  it('init: calls adminStore.fetchPendingEntries when admin session is valid', async () => {
    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    const navigate = jest.fn();

    const adminStore = (await import('../adminStore')).default;
    await store.init(navigate, t);

    expect(navigate).not.toHaveBeenCalled();
    expect(adminStore.fetchPendingEntries).toHaveBeenCalled();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('init: sets translated error on fetch failure', async () => {
    const adminStore = (await import('../adminStore')).default;
    adminStore.fetchPendingEntries.mockRejectedValueOnce(new Error('boom'));

    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    const navigate = jest.fn();
    await store.init(navigate, t);

    expect(store.error).toBe('Failed to fetch pending entries. Please try again later.');
    expect(store.loading).toBe(false);
  });

  it('accept: calls adminStore.acceptEntry; on error sets translated error', async () => {
    const adminStore = (await import('../adminStore')).default;
    adminStore.acceptEntry.mockRejectedValueOnce(new Error('fail'));

    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    await store.accept('1', t);
    expect(store.error).toBe('Failed to accept entry. Please try again later.');
  });

  it('declineConfirmed: does nothing if no declineEntryId', async () => {
    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    const adminStore = (await import('../adminStore')).default;
    await store.declineConfirmed(t);

    expect(adminStore.declineEntry).not.toHaveBeenCalled();
  });

  it('decline flow: open confirm -> declineConfirmed calls adminStore.declineEntry and closes confirm', async () => {
    const adminStore = (await import('../adminStore')).default;
    adminStore.declineEntry.mockResolvedValueOnce(undefined);

    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    store.openDeclineConfirm('99');
    expect(store.showDeclineConfirm).toBe(true);

    await store.declineConfirmed(t);

    expect(adminStore.declineEntry).toHaveBeenCalledWith('99');
    expect(store.showDeclineConfirm).toBe(false);
    expect(store.declineEntryId).toBeNull();
  });

  it('declineConfirmed: on error sets translated error and keeps confirm open', async () => {
    const adminStore = (await import('../adminStore')).default;
    adminStore.declineEntry.mockRejectedValueOnce(new Error('fail'));

    const AdminDashboardStore = await importFreshClass();
    const store = new AdminDashboardStore();

    store.openDeclineConfirm('99');

    await store.declineConfirmed(t);

    expect(store.error).toBe('Failed to decline entry. Please try again later.');
    expect(store.showDeclineConfirm).toBe(true); // still open
    expect(store.declineEntryId).toBe('99');
  });
});
