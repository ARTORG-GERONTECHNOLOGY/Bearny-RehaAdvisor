import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => jest.fn(),
}));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisations: 'Cardiology',
  },
}));

jest.mock('../../config/config.json', () => ({
  RecomendationInfo: { types: ['video', 'audio', 'website'] },
  patientInfo: {
    function: {
      Cardiology: { diagnosis: ['Coronary Artery Disease', 'Arrhythmia', 'Stroke'] },
    },
  },
}));

jest.mock('@/components/common/Header', () => () => <div>Header</div>);
jest.mock('@/components/common/Footer', () => () => <div>Footer</div>);

import AddInterventionView from '@/pages/AddInterventionView';

const renderPage = () =>
  render(
    <MemoryRouter>
      <AddInterventionView />
    </MemoryRouter>
  );

describe('AddInterventionView', () => {
  describe('Language field', () => {
    it('renders all 6 languages including PT and NL', () => {
      renderPage();
      const select = screen.getByRole('combobox', { name: /language/i }) as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('de');
      expect(values).toContain('en');
      expect(values).toContain('fr');
      expect(values).toContain('it');
      expect(values).toContain('pt');
      expect(values).toContain('nl');
    });

    it('defaults to empty (no language pre-selected)', () => {
      renderPage();
      const select = screen.getByRole('combobox', { name: /language/i }) as HTMLSelectElement;
      expect(select.value).toBe('');
    });
  });

  describe('External ID field', () => {
    it('renders the ID input with the new format placeholder', () => {
      renderPage();
      const input = screen.getByPlaceholderText('3500_web');
      expect(input).toBeInTheDocument();
    });

    it('shows format hint text with valid codes', () => {
      renderPage();
      expect(screen.getByText(/vid.*img.*gfx.*pdf.*br.*web.*aud.*app/i)).toBeInTheDocument();
    });

    it('shows inline error for an ID with wrong prefix length', () => {
      renderPage();
      const input = screen.getByPlaceholderText('3500_web');
      fireEvent.change(input, { target: { value: '35_web' } });
      expect(screen.getByText(/4 digits.*5 digits/i)).toBeInTheDocument();
    });

    it('shows inline error for an unknown format code', () => {
      renderPage();
      const input = screen.getByPlaceholderText('3500_web');
      fireEvent.change(input, { target: { value: '3500_xyz' } });
      expect(screen.getByText(/Unknown format code/i)).toBeInTheDocument();
    });

    it('shows no error for a valid 4-digit + format ID', () => {
      renderPage();
      const input = screen.getByPlaceholderText('3500_web');
      fireEvent.change(input, { target: { value: '3500_web' } });
      expect(screen.queryByText(/Unknown format code/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/4 digits.*5 digits/i)).not.toBeInTheDocument();
    });

    it('shows no error for a valid 5-digit + format ID', () => {
      renderPage();
      const input = screen.getByPlaceholderText('3500_web');
      fireEvent.change(input, { target: { value: '30500_vid' } });
      expect(screen.queryByText(/Unknown format code/i)).not.toBeInTheDocument();
    });
  });

  describe('Primary Diagnosis checkboxes', () => {
    it('renders a checkbox for each diagnosis from config', () => {
      renderPage();
      expect(screen.getByLabelText('Coronary Artery Disease')).toBeInTheDocument();
      expect(screen.getByLabelText('Arrhythmia')).toBeInTheDocument();
      expect(screen.getByLabelText('Stroke')).toBeInTheDocument();
    });

    it('allows selecting multiple diagnoses independently', () => {
      renderPage();
      const stroke = screen.getByLabelText('Stroke') as HTMLInputElement;
      const arrhythmia = screen.getByLabelText('Arrhythmia') as HTMLInputElement;

      fireEvent.click(stroke);
      fireEvent.click(arrhythmia);

      expect(stroke.checked).toBe(true);
      expect(arrhythmia.checked).toBe(true);
    });

    it('unchecks a diagnosis when clicked again', () => {
      renderPage();
      const stroke = screen.getByLabelText('Stroke') as HTMLInputElement;
      fireEvent.click(stroke);
      expect(stroke.checked).toBe(true);
      fireEvent.click(stroke);
      expect(stroke.checked).toBe(false);
    });
  });
});
