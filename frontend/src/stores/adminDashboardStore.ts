import { makeAutoObservable, runInAction } from 'mobx';
import adminStore from './adminStore';
import authStore from './authStore';

export class AdminDashboardStore {
  loading = true;
  error: string | null = null;

  // confirm decline modal
  showDeclineConfirm = false;
  declineEntryId: string | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  setError(v: string | null) {
    this.error = v;
  }

  openDeclineConfirm(entryId: string) {
    this.declineEntryId = entryId;
    this.showDeclineConfirm = true;
  }

  closeDeclineConfirm() {
    this.showDeclineConfirm = false;
    this.declineEntryId = null;
  }

  async init(navigate: (path: string) => void, t: (key: string) => string) {
    this.loading = true;
    this.error = null;

    try {
      await authStore.checkAuthentication();

      if (!authStore.isAuthenticated || authStore.userType !== 'Admin') {
        navigate('/unauthorized');
        return;
      }

      await adminStore.fetchPendingEntries();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error fetching pending entries:', err);
      runInAction(() => {
        this.error = t('Failed to fetch pending entries. Please try again later.');
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async accept(entryId: string, t: (key: string) => string) {
    this.error = null;
    try {
      await adminStore.acceptEntry(entryId);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error accepting entry:', err);
      runInAction(() => {
        this.error = t('Failed to accept entry. Please try again later.');
      });
    }
  }

  async declineConfirmed(t: (key: string) => string) {
    if (!this.declineEntryId) return;

    this.error = null;
    try {
      await adminStore.declineEntry(this.declineEntryId);
      runInAction(() => {
        this.closeDeclineConfirm();
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error declining entry:', err);
      runInAction(() => {
        this.error = t('Failed to decline entry. Please try again later.');
      });
    }
  }

  get hasEntries() {
    return (adminStore.pendingEntries?.length || 0) > 0;
  }
}
