jest.mock('@/stores/adminStore', () => ({
  __esModule: true,
  default: {
    pendingEntries: [] as unknown[],
    fetchPendingEntries: jest.fn(),
    acceptEntry: jest.fn(),
    declineEntry: jest.fn(),
  },
}));

import adminStore from '@/stores/adminStore';
import { AdminDashboardStore } from '@/stores/adminDashboardStore';

const mockAdminStore = adminStore as unknown as {
  pendingEntries: unknown[];
  fetchPendingEntries: jest.Mock;
  acceptEntry: jest.Mock;
  declineEntry: jest.Mock;
};

const t = (key: string) => key;

describe('AdminDashboardStore', () => {
  let store: AdminDashboardStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminStore.pendingEntries = [];
    store = new AdminDashboardStore();
  });

  it('starts in a loading state with no error', () => {
    expect(store.loading).toBe(true);
    expect(store.error).toBeNull();
  });

  it('init fetches pending entries and clears loading', async () => {
    mockAdminStore.fetchPendingEntries.mockResolvedValueOnce(undefined);
    await store.init(t);

    expect(mockAdminStore.fetchPendingEntries).toHaveBeenCalledTimes(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('init sets an error message when fetching fails', async () => {
    mockAdminStore.fetchPendingEntries.mockRejectedValueOnce(new Error('boom'));
    await store.init(t);

    expect(store.error).toBe('Failed to fetch pending entries. Please try again later.');
    expect(store.loading).toBe(false);
  });

  it('hasEntries reflects the underlying adminStore list', () => {
    expect(store.hasEntries).toBe(false);
    mockAdminStore.pendingEntries = [{ id: '1' }];
    expect(store.hasEntries).toBe(true);
  });

  it('opens and closes the decline confirmation with the entry id', () => {
    store.openDeclineConfirm('entry-1');
    expect(store.showDeclineConfirm).toBe(true);
    expect(store.declineEntryId).toBe('entry-1');

    store.closeDeclineConfirm();
    expect(store.showDeclineConfirm).toBe(false);
    expect(store.declineEntryId).toBeNull();
  });

  it('accept calls adminStore.acceptEntry and surfaces errors', async () => {
    mockAdminStore.acceptEntry.mockRejectedValueOnce(new Error('fail'));
    await store.accept('entry-1', t);

    expect(mockAdminStore.acceptEntry).toHaveBeenCalledWith('entry-1');
    expect(store.error).toBe('Failed to accept entry. Please try again later.');
  });

  it('declineConfirmed does nothing without a pending decline id', async () => {
    await store.declineConfirmed(t);
    expect(mockAdminStore.declineEntry).not.toHaveBeenCalled();
  });

  it('declineConfirmed declines the entry and closes the modal on success', async () => {
    mockAdminStore.declineEntry.mockResolvedValueOnce(undefined);
    store.openDeclineConfirm('entry-2');

    await store.declineConfirmed(t);

    expect(mockAdminStore.declineEntry).toHaveBeenCalledWith('entry-2');
    expect(store.showDeclineConfirm).toBe(false);
    expect(store.declineEntryId).toBeNull();
  });

  it('declineConfirmed sets an error and keeps the modal open on failure', async () => {
    mockAdminStore.declineEntry.mockRejectedValueOnce(new Error('fail'));
    store.openDeclineConfirm('entry-3');

    await store.declineConfirmed(t);

    expect(store.error).toBe('Failed to decline entry. Please try again later.');
    expect(store.showDeclineConfirm).toBe(true);
  });
});
