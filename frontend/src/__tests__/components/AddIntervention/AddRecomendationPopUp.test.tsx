import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisations: 'Cardiology',
  },
}));

jest.mock('@/stores/interventionsTaxonomyStore', () => ({
  __esModule: true,
  default: {
    fetchAll: jest.fn(),
    toOptions: (vals: string[]) => (vals || []).map((v: string) => ({ value: v, label: v })),
    originalLanguages: [],
    lc9: [],
    topics: [],
    aims: [],
    where: [],
    setting: [],
    cognitiveLevels: [],
    physicalLevels: [],
    frequencyTime: [],
    timing: [],
    durationBuckets: [],
    sexSpecific: [],
    inputFrom: [],
    contentTypes: ['Video', 'Audio', 'Website', 'Text', 'Image', 'App', 'Streaming'],
    primaryDiagnoses: [],
  },
}));

jest.mock('@/config/config.json', () => ({
  RecomendationInfo: { types: ['video', 'audio'] },
  patientInfo: {
    function: {
      Cardiology: { diagnosis: ['Coronary Artery Disease', 'Arrhythmia'] },
    },
  },
}));

// Render StandardModal body inline to expose form fields
jest.mock('@/components/common/StandardModal', () => ({
  __esModule: true,
  default: ({ children, show }: any) => (show ? <div>{children}</div> : null),
}));

// react-select is complex — stub to a plain native select
jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId }: any) => (
    <select
      id={inputId}
      value={value?.value ?? ''}
      onChange={(e) => onChange(options.find((o: any) => o.value === e.target.value))}
    >
      {(options || []).map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
}));

import AddRecomendationPopUp from '@/components/AddIntervention/AddRecomendationPopUp';

describe('AddRecomendationPopUp', () => {
  const renderPopup = () =>
    render(
      <AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={jest.fn()} />
    );

  describe('Language dropdown', () => {
    it('contains all 6 supported languages including PT and NL', () => {
      renderPopup();
      // The form has both "Language" and "Original language" selects; use the one with id="language"
      const select = document.getElementById('language') as HTMLSelectElement;
      expect(select).not.toBeNull();
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('de');
      expect(values).toContain('en');
      expect(values).toContain('fr');
      expect(values).toContain('it');
      expect(values).toContain('pt');
      expect(values).toContain('nl');
    });

    it('defaults to English', () => {
      renderPopup();
      const select = document.getElementById('language') as HTMLSelectElement;
      expect(select.value).toBe('en');
    });
  });

  describe('External ID field', () => {
    it('renders with the new format placeholder', () => {
      renderPopup();
      const input = screen.getByPlaceholderText(/3500_web/i);
      expect(input).toBeInTheDocument();
    });

    it('shows hint text with valid format codes', () => {
      renderPopup();
      expect(screen.getByText(/vid.*img.*gfx.*pdf.*br.*web.*aud.*app/i)).toBeInTheDocument();
    });
  });
});
