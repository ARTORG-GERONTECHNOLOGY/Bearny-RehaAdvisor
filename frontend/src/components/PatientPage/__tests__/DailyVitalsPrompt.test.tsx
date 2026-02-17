// src/components/PatientPage/__tests__/DailyVitalsPrompt.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DailyVitalsPrompt from '../DailyVitalsPrompt';
import authStore from '../../../stores/authStore';
import { patientVitalsStore } from '../../../stores/patientVitalsStore';

jest.mock('../../../stores/authStore', () => ({
  __esModule: true,
  default: { id: 'p1' },
}));

jest.mock('../../../stores/patientVitalsStore', () => ({
  patientVitalsStore: {
    loading: false,
    exists: false,
    posting: false,
    today: '2026-02-16',
    error: '',
    successMsg: '',
    checkExists: jest.fn(),
    submit: jest.fn(),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (x: any) => x }),
}));

describe('DailyVitalsPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (patientVitalsStore as any).loading = false;
    (patientVitalsStore as any).exists = false;
  });

  it('calls checkExists on mount', async () => {
    render(<DailyVitalsPrompt />);
    await waitFor(() => {
      expect(patientVitalsStore.checkExists).toHaveBeenCalledWith('p1');
    });
  });

  it('returns null when exists is true', () => {
    (patientVitalsStore as any).exists = true;
    const { container } = render(<DailyVitalsPrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('enables submit when any numeric field is provided and posts correct payload', async () => {
    (patientVitalsStore.submit as jest.Mock).mockResolvedValue(undefined);

    render(<DailyVitalsPrompt />);

    const saveBtn = screen.getByRole('button', { name: 'Save for today' });
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '72.4' } });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patientVitalsStore.submit).toHaveBeenCalledWith('p1', {
        weight_kg: 72.4,
        bp_sys: null,
        bp_dia: null,
      });
    });
  });
});
