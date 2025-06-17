import { makeAutoObservable } from 'mobx';
import apiClient from '../api/client';

class AdminStore {
  pendingEntries: any[] = []; // <-- Make sure this is initialized as an empty array
  error: string = '';

  constructor() {
    makeAutoObservable(this);
  }

  fetchPendingEntries = async () => {
    try {
      const response = await apiClient.get('/admin/pending-users');
      this.pendingEntries = response.data.pending_users; // ✅ Correct mapping
    } catch (err) {
      console.error('Failed to fetch pending entries:', err);
      this.error = 'Failed to fetch pending entries. Please try again later.';
    }
  };

  async acceptEntry(entryId: string) {
    try {
      await apiClient.post('/admin/accept-user/', { userId: entryId });
      this.fetchPendingEntries(); // refresh the list after acceptance
    } catch (err) {
      console.error('Error accepting entry:', err);
      this.error = 'Failed to accept entry. Please try again later.';
    }
  }

  async declineEntry(entryId: string) {
    try {
      await apiClient.post('/admin/decline-user/', { userId: entryId });
      this.fetchPendingEntries(); // refresh the list after decline
    } catch (err) {
      console.error('Error declining entry:', err);
      this.error = 'Failed to decline entry. Please try again later.';
    }
  }
}

const adminStore = new AdminStore();
export default adminStore;
