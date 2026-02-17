describe('userProfileStore', () => {
  let apiGet: jest.Mock;
  let apiPut: jest.Mock;
  let apiDelete: jest.Mock;

  async function importFreshStore() {
    jest.resetModules();
    const mod = await import('../userProfileStore');
    return mod.default;
  }

  const authStoreMock = {
    id: 'u1',
    logout: jest.fn(async () => {}),
  };

  beforeEach(() => {
    apiGet = jest.fn();
    apiPut = jest.fn();
    apiDelete = jest.fn();

    jest.doMock('../../api/client', () => ({
      __esModule: true,
      default: {
        get: (...args: any[]) => apiGet(...args),
        put: (...args: any[]) => apiPut(...args),
        delete: (...args: any[]) => apiDelete(...args),
      },
    }));

    jest.doMock('../authStore', () => ({
      __esModule: true,
      default: authStoreMock,
    }));

    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.dontMock('../../api/client');
    jest.dontMock('../authStore');
  });

  it('fetchProfile: no userId -> does nothing', async () => {
    authStoreMock.id = '';

    const store = await importFreshStore();
    await store.fetchProfile();

    expect(apiGet).not.toHaveBeenCalled();
  });

  it('fetchProfile: success sets userData and clears loading', async () => {
    authStoreMock.id = 'u1';
    apiGet.mockResolvedValueOnce({ data: { email: 'x@y.com' } });

    const store = await importFreshStore();
    await store.fetchProfile();

    expect(apiGet).toHaveBeenCalledWith('/users/u1/profile');
    expect(store.userData).toEqual({ email: 'x@y.com' });
    expect(store.loading).toBe(false);
    expect(store.errorBanner).toBe('');
  });

  it('fetchProfile: failure sets errorBanner and clears loading', async () => {
    authStoreMock.id = 'u1';
    apiGet.mockRejectedValueOnce(new Error('fail'));

    const store = await importFreshStore();
    await store.fetchProfile();

    expect(store.userData).toBeNull();
    expect(store.errorBanner).toBe('Failed to load user profile');
    expect(store.loading).toBe(false);
  });

  it('updateProfile: prevents double-submit when saving=true', async () => {
    authStoreMock.id = 'u1';
    const store = await importFreshStore();

    store.saving = true;
    await store.updateProfile({ email: 'a@b.com' } as any);

    expect(apiPut).not.toHaveBeenCalled();
  });

  it('updateProfile: success updates userData, sets success banner, and switches mode to view', async () => {
    authStoreMock.id = 'u1';

    apiPut.mockResolvedValueOnce({ status: 200 });
    apiGet.mockResolvedValueOnce({ data: { email: 'new@b.com' } });

    const store = await importFreshStore();
    store.mode = 'editProfile';

    await store.updateProfile({ email: 'new@b.com' } as any);

    expect(apiPut).toHaveBeenCalledWith('/users/u1/profile/', { email: 'new@b.com' });
    expect(apiGet).toHaveBeenCalledWith('/users/u1/profile');
    expect(store.userData).toEqual({ email: 'new@b.com' });
    expect(store.successBanner).toBe('Profile updated successfully');
    expect(store.mode).toBe('view');
    expect(store.saving).toBe(false);
  });

  it('setSuccess: auto clears banner after timeout', async () => {
    const store = await importFreshStore();

    store.setSuccess('OK', 2500);
    expect(store.successBanner).toBe('OK');

    jest.advanceTimersByTime(2500);
    expect(store.successBanner).toBe('');
  });

  it('updateProfile: failure sets errorBanner', async () => {
    authStoreMock.id = 'u1';
    apiPut.mockRejectedValueOnce(new Error('fail'));

    const store = await importFreshStore();
    await store.updateProfile({ email: 'x@y.com' } as any);

    expect(store.errorBanner).toBe('Failed to update profile');
    expect(store.saving).toBe(false);
  });

  it('changePassword: success sets success banner and switches mode to view', async () => {
    authStoreMock.id = 'u1';
    apiPut.mockResolvedValueOnce({ status: 200 });

    const store = await importFreshStore();
    store.mode = 'changePassword';

    await store.changePassword('old', 'new');

    expect(apiPut).toHaveBeenCalledWith('/users/u1/change-password/', {
      old_password: 'old',
      new_password: 'new',
    });
    expect(store.successBanner).toBe('Password updated successfully');
    expect(store.mode).toBe('view');
    expect(store.saving).toBe(false);
  });

  it('changePassword: failure uses backend error if provided', async () => {
    authStoreMock.id = 'u1';
    apiPut.mockRejectedValueOnce({ response: { data: { error: 'Bad old password' } } });

    const store = await importFreshStore();
    await store.changePassword('old', 'new');

    expect(store.errorBanner).toBe('Bad old password');
    expect(store.saving).toBe(false);
  });

  it('deleteAccount: prevents double-submit when deleting=true', async () => {
    authStoreMock.id = 'u1';
    const store = await importFreshStore();

    store.deleting = true;
    await store.deleteAccount();

    expect(apiDelete).not.toHaveBeenCalled();
  });

  it('deleteAccount: success closes popup, sets success, and calls authStore.logout', async () => {
    authStoreMock.id = 'u1';
    apiDelete.mockResolvedValueOnce({ status: 204 });

    const store = await importFreshStore();
    store.showDeletePopup = true;

    await store.deleteAccount();

    expect(apiDelete).toHaveBeenCalledWith('/users/u1/profile/');
    expect(store.successBanner).toBe('Account deleted successfully');
    expect(store.showDeletePopup).toBe(false);
    expect(authStoreMock.logout).toHaveBeenCalled();
    expect(store.deleting).toBe(false);
  });

  it('deleteAccount: failure sets errorBanner and does not call logout', async () => {
    authStoreMock.id = 'u1';
    apiDelete.mockRejectedValueOnce(new Error('fail'));

    const store = await importFreshStore();
    await store.deleteAccount();

    expect(store.errorBanner).toBe('Failed to delete account');
    expect(authStoreMock.logout).not.toHaveBeenCalled(
