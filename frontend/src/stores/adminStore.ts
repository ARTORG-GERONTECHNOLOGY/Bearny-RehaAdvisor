import { makeAutoObservable } from 'mobx';
import apiClient from '../api/client';

class AdminStore {
  pendingEntries: any[] = []; // <-- Make sure this is initialized as an empty array

  constructor() {
    makeAutoObservable(this);
  }

  fetchPendingEntries = async () => {
    try {
      const response = await apiClient.get('/admin/pending-users');
      this.pendingEntries = response.data.pending_users; // ✅ Correct mapping
    } catch (error) {
      console.error('Failed to fetch pending entries:', error);
    }
  };

  async acceptEntry(entryId: string) {
    try {
      await apiClient.post('/admin/accept-user/', { userId: entryId });
      this.fetchPendingEntries(); // refresh the list after acceptance
    } catch (error) {
      console.error('Error accepting entry:', error);
    }
  }

  async declineEntry(entryId: string) {
    try {
      await apiClient.post('/admin/decline-user/', { userId: entryId });
      this.fetchPendingEntries(); // refresh the list after decline
    } catch (error) {
      console.error('Error declining entry:', error);
    }
  }
}

const adminStore = new AdminStore();
export default adminStore;
