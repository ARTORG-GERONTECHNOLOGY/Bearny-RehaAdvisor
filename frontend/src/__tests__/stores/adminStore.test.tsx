import adminStore from '@/stores/adminStore';
import apiClient from '@/api/client';

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

describe('adminStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches pending entries', async () => {
    const mockData = { pending_users: [{ id: 1, name: 'Jane' }] };
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: mockData });

    await adminStore.fetchPendingEntries();

    expect(apiClient.get).toHaveBeenCalledWith('/admin/pending-users');
    expect(adminStore.pendingEntries).toEqual(mockData.pending_users);
  });

  it('accepts an entry and refreshes list', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({});

    const mockFetch = jest.fn();
    const original = adminStore.fetchPendingEntries;
    adminStore.fetchPendingEntries = mockFetch; // 👈 Mock BEFORE calling

    await adminStore.acceptEntry('1');

    expect(apiClient.post).toHaveBeenCalledWith('/admin/accept-user/', { userId: '1' });
    expect(mockFetch).toHaveBeenCalled(); // 👈 now it's a mock

    adminStore.fetchPendingEntries = original; // restore
  });

  it('declines an entry and refreshes list', async () => {
    (apiClient.post as jest.Mock).mockResolvedValueOnce({});

    const mockFetch = jest.fn();
    const original = adminStore.fetchPendingEntries;
    adminStore.fetchPendingEntries = mockFetch;

    await adminStore.declineEntry('2');

    expect(apiClient.post).toHaveBeenCalledWith('/admin/decline-user/', { userId: '2' });
    expect(mockFetch).toHaveBeenCalled();

    adminStore.fetchPendingEntries = original;
  });
});
