// src/stores/rootStore.ts
import { AuthStore } from './authStore';
import { PatientPlanStore } from './patientPlanStore';

export class RootStore {
  authStore = new AuthStore(this);
  patientPlanStore = new PatientPlanStore(this);
}

export const rootStore = new RootStore(); // ✅ singleton instance
