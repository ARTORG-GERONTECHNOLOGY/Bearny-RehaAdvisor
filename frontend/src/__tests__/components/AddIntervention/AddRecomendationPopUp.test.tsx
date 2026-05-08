import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

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
    topics: [],
    aims: [],
    where: [],
    setting: [],
    cognitiveLevels: [],
    physicalLevels: [],
    durationBuckets: [],
    sexSpecific: [],
    inputFrom: [],
    // Real taxonomy labels — lowercase keys, not backend canonical names
    contentTypes: ['brochure', 'video', 'audio', 'graphics', 'app', 'website'],
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
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

import interventionsTaxonomyStore from '@/stores/interventionsTaxonomyStore';
import mockApiClient from '@/__mocks__/api/client';
import AddRecomendationPopUp from '@/components/AddIntervention/AddRecomendationPopUp';

const ORIGINAL_CONTENT_TYPES = ['brochure', 'video', 'audio', 'graphics', 'app', 'website'];

describe('AddRecomendationPopUp', () => {
  const renderPopup = () =>
    render(<AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={jest.fn()} />);

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

  describe('Content type dropdown', () => {
    it('shows the taxonomy labels including brochure and graphics', () => {
      renderPopup();
      const select = document.getElementById('contentType') as HTMLSelectElement;
      expect(select).not.toBeNull();
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).toContain('brochure');
      expect(values).toContain('graphics');
      expect(values).toContain('video');
    });

    it('does not show backend canonical names like pdf or image as options', () => {
      renderPopup();
      const select = document.getElementById('contentType') as HTMLSelectElement;
      const values = Array.from(select.options).map((o) => o.value);
      expect(values).not.toContain('pdf');
      expect(values).not.toContain('image');
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

  describe('Content type dropdown', () => {
    beforeEach(() => {
      (interventionsTaxonomyStore as any).contentTypes = ORIGINAL_CONTENT_TYPES;
    });

    afterEach(() => {
      (interventionsTaxonomyStore as any).contentTypes = [
        'Video',
        'Audio',
        'Website',
        'Text',
        'Image',
        'App',
        'Streaming',
      ];
    });

    it('renders the original taxonomy values in the dropdown', () => {
      renderPopup();
      const select = document.getElementById('contentType') as HTMLSelectElement;
      expect(select).not.toBeNull();
      const values = Array.from(select.options)
        .map((o) => o.value)
        .filter(Boolean);
      expect(values).toEqual(ORIGINAL_CONTENT_TYPES);
    });

    it('shows each original label as option text', () => {
      renderPopup();
      for (const ct of ORIGINAL_CONTENT_TYPES) {
        expect(screen.getByRole('option', { name: ct })).toBeInTheDocument();
      }
    });
  });

  describe('Content type mapping on submit', () => {
    const MAPPINGS: [string, string][] = [
      ['graphics', 'image'],
      ['brochure', 'pdf'],
      ['video', 'video'],
      ['audio', 'audio'],
      ['app', 'app'],
      ['website', 'website'],
    ];

    beforeEach(() => {
      (interventionsTaxonomyStore as any).contentTypes = ORIGINAL_CONTENT_TYPES;
      (mockApiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    });

    afterEach(() => {
      jest.clearAllMocks();
      (interventionsTaxonomyStore as any).contentTypes = [
        'Video',
        'Audio',
        'Website',
        'Text',
        'Image',
        'App',
        'Streaming',
      ];
    });

    const fillAndSubmit = async (contentTypeValue: string) => {
      renderPopup();

      fireEvent.change(document.getElementById('title') as HTMLElement, {
        target: { value: 'Test intervention' },
      });
      fireEvent.change(document.getElementById('description') as HTMLElement, {
        target: { value: 'Test description' },
      });
      fireEvent.change(document.getElementById('duration') as HTMLElement, {
        target: { value: '10' },
      });

      const contentTypeSelect = document.getElementById('contentType') as HTMLSelectElement;
      fireEvent.change(contentTypeSelect, { target: { value: contentTypeValue } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });
    };

    for (const [frontendValue, backendValue] of MAPPINGS) {
      it(`maps "${frontendValue}" → "${backendValue}" in the API payload`, async () => {
        await fillAndSubmit(frontendValue);

        await waitFor(() => {
          expect(mockApiClient.post).toHaveBeenCalled();
        });

        const formData: FormData = (mockApiClient.post as jest.Mock).mock.calls[0][1];
        expect(formData.get('contentType')).toBe(backendValue);
      });
    }
  });
});
