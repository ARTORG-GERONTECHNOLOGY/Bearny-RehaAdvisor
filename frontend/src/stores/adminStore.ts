import { makeAutoObservable } from "mobx";
import axios from "axios";

class AdminStore {
  pendingEntries: Array<any> = [];
  showEditModal: boolean = false;
  editingEntry: any = null;

  constructor() {
    makeAutoObservable(this);
  }

  // Fetch all pending entries (therapists, researchers, content)
  async fetchPendingEntries() {
    try {
      const response = await axios.get('/api/pending-entries'); // Adjust your API URL
      this.pendingEntries = response.data;
    } catch (error) {
      console.error('Error fetching pending entries:', error);
    }
  }

  // Accept an entry
  async acceptEntry(entryId: number, entryType: string) {
    try {
      await axios.post(`/api/accept-entry`, { entryId, entryType });
      this.pendingEntries = this.pendingEntries.filter(entry => entry.id !== entryId); // Remove the accepted entry from the list
    } catch (error) {
      console.error('Error accepting entry:', error);
    }
  }

  // Decline an entry
  async declineEntry(entryId: number, entryType: string) {
    try {
      await axios.post(`/api/decline-entry`, { entryId, entryType });
      this.pendingEntries = this.pendingEntries.filter(entry => entry.id !== entryId); // Remove the declined entry from the list
    } catch (error) {
      console.error('Error declining entry:', error);
    }
  }

  // Set the current entry being edited
  setEditingEntry(entry: any) {
    this.editingEntry = entry;
  }

  // Toggle the edit modal
  setShowEditModal(show: boolean) {
    this.showEditModal = show;
  }

  // Update fields of the entry being edited
  updateEditingEntry(field: string, value: string) {
    if (this.editingEntry) {
      this.editingEntry[field] = value;
    }
  }

  // Save the edited entry
  async saveEditedEntry() {
    try {
      await axios.post(`/api/edit-entry`, this.editingEntry);
      this.setShowEditModal(false);
    } catch (error) {
      console.error('Error saving edited entry:', error);
    }
  }
}

const adminStore = new AdminStore();
export default adminStore;
