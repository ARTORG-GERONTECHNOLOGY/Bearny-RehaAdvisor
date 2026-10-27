export const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPhone = (phone: string): boolean => /^\+?[0-9]{7,15}$/.test(phone);

// Must match _VITAL_RANGES in backend/core/views/patient_views.py.
export const VITAL_RANGES = {
  weightKg: { min: 25, max: 400 },
  bpSys: { min: 60, max: 250 },
  bpDia: { min: 40, max: 150 },
} as const;

export const isInRange = (value: number, range: { min: number; max: number }): boolean =>
  value >= range.min && value <= range.max;
