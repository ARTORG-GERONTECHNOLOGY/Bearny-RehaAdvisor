import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => jest.requireActual('@/__mocks__/api/client'));

jest.mock('@/stores/authStore', () => ({
  __esModule: true,
  default: {
    checkAuthentication: jest.fn(),
    isAuthenticated: true,
    userType: 'Therapist',
    specialisations: 'Cardiology',
    id: 'therapist-1',
  },
}));

jest.mock('@/stores/interventionsTaxonomyStore', () => ({
  __esModule: true,
  default: {
    fetchAll: jest.fn(),
    toOptions: (vals: string[]) => (vals || []).map((v: string) => ({ value: v, label: v })),
    originalLanguages: ['en', 'de'],
    topics: ['Disease', 'Lifestyle'],
    aims: ['Education', 'Exercise'],
    where: ['Home', 'Outside'],
    setting: ['Individual', 'Group'],
    cognitiveLevels: ['Low', 'High'],
    physicalLevels: ['Low', 'High'],
    durationBuckets: ['Short', 'Long'],
    sexSpecific: ['Male', 'Female'],
    inputFrom: ['Patient', 'Therapist'],
    // Real taxonomy labels — lowercase keys, not backend canonical names
    contentTypes: ['brochure', 'video', 'audio', 'graphics', 'app', 'website'],
    primaryDiagnoses: ['Stroke', 'COPD'],
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

// Render StandardModal body (and footer, e.g. the Close button) inline to expose form fields
jest.mock('@/components/common/StandardModal', () => ({
  __esModule: true,
  default: ({ children, footer, show }: any) =>
    show ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

// react-select is complex — stub to a plain native select for single-select usage,
// and to a set of toggle buttons (one per option) for isMulti usage so
// handleMultiChange(field, selectedOptions[]) gets exercised realistically.
// Fields without an explicit inputId (inputFrom/aims/topics/where/setting) share
// the "select-multi" testid, in the same order they appear in the JSX.
jest.mock('react-select', () => ({
  __esModule: true,
  default: ({ options, value, onChange, inputId, isMulti }: any) => {
    if (isMulti) {
      const current = value || [];
      return (
        <div data-testid={inputId ? `select-${inputId}` : 'select-multi'}>
          {(options || []).map((o: any) => {
            const selected = current.some((v: any) => v.value === o.value);
            return (
              <button
                key={o.value}
                type="button"
                data-selected={selected}
                onClick={() => {
                  const next = selected
                    ? current.filter((v: any) => v.value !== o.value)
                    : [...current, o];
                  onChange(next);
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
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
    );
  },
}));

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

import interventionsTaxonomyStore from '@/stores/interventionsTaxonomyStore';
import mockApiClient from '@/__mocks__/api/client';
import AddRecomendationPopUp from '@/components/AddIntervention/AddRecomendationPopUp';

const ORIGINAL_CONTENT_TYPES = ['brochure', 'video', 'audio', 'graphics', 'app', 'website'];

describe('AddRecomendationPopUp', () => {
  const renderPopup = () =>
    render(<AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={jest.fn()} />);

  // Safe persistent default so any test that marks the intervention private (and
  // doesn't itself provide a get() mock) settles patientsLoaded=true instead of
  // retrying forever via the component's fetchTherapistPatients effect.
  beforeEach(() => {
    (mockApiClient.get as jest.Mock).mockResolvedValue({ data: { data: [] } });
  });

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
      // Restore the mock's true default (matches the jest.mock() factory above) so
      // later describes in this file don't inherit a stale contentTypes value.
      (interventionsTaxonomyStore as any).contentTypes = ORIGINAL_CONTENT_TYPES;
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
      // Restore the mock's true default (matches the jest.mock() factory above) so
      // later describes in this file don't inherit a stale contentTypes value.
      (interventionsTaxonomyStore as any).contentTypes = ORIGINAL_CONTENT_TYPES;
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

  // ------------------------------------------------------------------
  // Client-side validation
  // ------------------------------------------------------------------
  describe('validation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('flags required fields when submitting an empty form', async () => {
      renderPopup();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByText('Title is required')).toBeInTheDocument();
      expect(screen.getByText('Description is required')).toBeInTheDocument();
      expect(screen.getByText('Duration must be greater than 0')).toBeInTheDocument();
      expect(screen.getByText('Please select a content type.')).toBeInTheDocument();
      expect(
        screen.getByText('Please correct the highlighted fields.')
      ).toBeInTheDocument();
      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('flags an unrealistically long duration', async () => {
      renderPopup();
      fireEvent.change(document.getElementById('title')!, { target: { value: 'T' } });
      fireEvent.change(document.getElementById('description')!, { target: { value: 'D' } });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '9999' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        screen.getByText('Duration seems too high (max 600 minutes).')
      ).toBeInTheDocument();
    });

    it('requires a URL for an external media item', async () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByText('URL is required')).toBeInTheDocument();
    });

    it('rejects a non-http(s) media URL', async () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'ftp://example.com/file' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        screen.getByText('URL must start with http:// or https://')
      ).toBeInTheDocument();
    });

    it('requires a file when the media kind is "Upload file"', async () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      const kindSelects = screen.getAllByRole('combobox');
      const kindSelect = kindSelects.find((el) =>
        within(el).queryByRole('option', { name: 'Upload file' })
      )!;
      fireEvent.change(kindSelect, { target: { value: 'file' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByText('Please select a file')).toBeInTheDocument();
    });

    it('requires a patient when the intervention is marked private', async () => {
      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByText('Please select a patient')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Media rows
  // ------------------------------------------------------------------
  describe('media rows', () => {
    it('shows an empty-state message when no media has been added', () => {
      renderPopup();
      expect(
        screen.getByText(/No media added yet\. You can add links or upload files\./i)
      ).toBeInTheDocument();
    });

    it('adds and removes a media row', () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      expect(screen.getByText('Media item #1')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Remove media/i }));
      expect(screen.queryByText('Media item #1')).not.toBeInTheDocument();
    });

    it('shows a URL field for "External link" kind and a file field for "Upload file" kind', () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();

      const kindSelects = screen.getAllByRole('combobox');
      const kindSelect = kindSelects.find((el) =>
        within(el).queryByRole('option', { name: 'Upload file' })
      )!;
      fireEvent.change(kindSelect, { target: { value: 'file' } });

      expect(screen.queryByPlaceholderText('https://...')).not.toBeInTheDocument();
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('rejects a media file larger than 1GB', () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      const kindSelects = screen.getAllByRole('combobox');
      const kindSelect = kindSelects.find((el) =>
        within(el).queryByRole('option', { name: 'Upload file' })
      )!;
      fireEvent.change(kindSelect, { target: { value: 'file' } });

      const bigFile = new File(['x'], 'big.mp4', { type: 'video/mp4' });
      Object.defineProperty(bigFile, 'size', { value: 1024 * 1024 * 1024 + 1 });

      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [bigFile] },
      });

      expect(screen.getByText('File is too large (max 1GB).')).toBeInTheDocument();
    });

    it('supports multiple media rows independently', () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));

      expect(screen.getByText('Media item #1')).toBeInTheDocument();
      expect(screen.getByText('Media item #2')).toBeInTheDocument();

      fireEvent.click(screen.getAllByRole('button', { name: /Remove media/i })[0]);

      expect(screen.queryByText('Media item #2')).not.toBeInTheDocument();
      expect(screen.getByText('Media item #1')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Private / patient assignment
  // ------------------------------------------------------------------
  describe('private intervention assignment', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('loads therapist patients once marked private', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: { data: [{ _id: 'p1', patient_code: 'PAT-1' }] },
      });

      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      await waitFor(() => {
        expect(mockApiClient.get).toHaveBeenCalledWith('/therapists/therapist-1/patients/');
      });
    });

    it('lists fetched patients in the assignment dropdown', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ _id: 'p1', patient_code: 'PAT-1' }],
      });

      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      expect(await screen.findByRole('option', { name: 'PAT-1' })).toBeInTheDocument();
    });

    it('shows a load error and lets the user retry', async () => {
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network down'));

      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      expect(await screen.findByText('Failed to fetch patients.')).toBeInTheDocument();

      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ _id: 'p1', patient_code: 'PAT-1' }],
      });
      fireEvent.click(screen.getByRole('button', { name: /Reload/i }));

      expect(await screen.findByRole('option', { name: 'PAT-1' })).toBeInTheDocument();
    });

    it('resets the assigned patient when unchecking private', () => {
      renderPopup();
      const checkbox = screen.getByLabelText(/Make this a private intervention/i);
      fireEvent.click(checkbox);
      fireEvent.click(checkbox);
      expect(screen.queryByLabelText(/Assign to Patient/i)).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Multi-select taxonomy fields
  // ------------------------------------------------------------------
  describe('multi-select taxonomy fields', () => {
    it('toggles a value on and off in the Aims field', () => {
      renderPopup();
      // DOM order of the generic multi-selects: inputFrom, aims, topics, where, setting
      const multiSelects = screen.getAllByTestId('select-multi');
      const aims = multiSelects[1];

      const educationBtn = within(aims).getByText('Education');
      expect(educationBtn).toHaveAttribute('data-selected', 'false');

      fireEvent.click(educationBtn);
      expect(within(aims).getByText('Education')).toHaveAttribute('data-selected', 'true');

      fireEvent.click(within(aims).getByText('Education'));
      expect(within(aims).getByText('Education')).toHaveAttribute('data-selected', 'false');
    });

    it('selects a primary diagnosis via its dedicated multi-select', () => {
      renderPopup();
      const diagnosisSelect = screen.getByTestId('select-primaryDiagnosis');
      fireEvent.click(within(diagnosisSelect).getByText('Stroke'));
      expect(within(diagnosisSelect).getByText('Stroke')).toHaveAttribute(
        'data-selected',
        'true'
      );
    });
  });

  // ------------------------------------------------------------------
  // Successful submission payload
  // ------------------------------------------------------------------
  describe('successful submission', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const fillRequiredFields = () => {
      fireEvent.change(document.getElementById('title')!, {
        target: { value: 'Breathing Exercise' },
      });
      fireEvent.change(document.getElementById('description')!, {
        target: { value: 'A calming exercise' },
      });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '15' } });
      fireEvent.change(document.getElementById('contentType')!, {
        target: { value: 'video' },
      });
    };

    it('submits a well-formed FormData payload and shows the success alert', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });
      const onSuccess = jest.fn();
      render(
        <AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={onSuccess} />
      );

      fillRequiredFields();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
      const [url, formData, config] = (mockApiClient.post as jest.Mock).mock.calls[0];
      expect(url).toBe('/interventions/add/');
      expect(formData.get('title')).toBe('Breathing Exercise');
      expect(formData.get('description')).toBe('A calming exercise');
      expect(formData.get('duration')).toBe('15');
      expect(formData.get('language')).toBe('en');
      expect(formData.get('isPrivate')).toBe('false');
      expect(JSON.parse(formData.get('taxonomy') as string)).toEqual(
        expect.objectContaining({ input_from: [], aims: [] })
      );
      expect(config).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });

      expect(onSuccess).toHaveBeenCalled();
      expect(await screen.findByText('Intervention successfully added')).toBeInTheDocument();
    });

    it('includes the patientId in the payload when private', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ _id: 'p1', patient_code: 'PAT-1' }],
      });
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });

      renderPopup();
      fillRequiredFields();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));
      await screen.findByRole('option', { name: 'PAT-1' });
      fireEvent.change(document.getElementById('patientId')!, { target: { value: 'p1' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
      const formData = (mockApiClient.post as jest.Mock).mock.calls[0][1];
      expect(formData.get('patientId')).toBe('p1');
    });
  });

  // ------------------------------------------------------------------
  // Backend error handling
  // ------------------------------------------------------------------
  describe('backend error handling', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const fillRequiredFields = () => {
      fireEvent.change(document.getElementById('title')!, { target: { value: 'X' } });
      fireEvent.change(document.getElementById('description')!, { target: { value: 'Y' } });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '10' } });
      fireEvent.change(document.getElementById('contentType')!, {
        target: { value: 'video' },
      });
    };

    it('maps field_errors onto the form and shows a details toggle', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 400,
        data: { field_errors: { title: ['Already exists'] } },
      });

      renderPopup();
      fillRequiredFields();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        await screen.findByText('There are validation errors. Please check the details below.')
      ).toBeInTheDocument();
      const toggle = screen.getByRole('button', { name: /Hide details/i });
      expect(toggle).toBeInTheDocument();
      expect(screen.getByText('Already exists')).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.getByRole('button', { name: /Show details/i })).toBeInTheDocument();
    });

    it('shows non_field_errors as the banner message', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 400,
        data: { non_field_errors: ['Duplicate external_id for this language.'] },
      });

      renderPopup();
      fillRequiredFields();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        await screen.findByText('Duplicate external_id for this language.')
      ).toBeInTheDocument();
    });

    it('shows a generic error message when the request throws a non-axios error', async () => {
      (mockApiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      renderPopup();
      fillRequiredFields();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        await screen.findByText('An unexpected error occurred. Please try again.')
      ).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // Close behavior
  // ------------------------------------------------------------------
  describe('close behavior', () => {
    it('calls handleClose and resets the form', () => {
      const handleClose = jest.fn();
      render(<AddRecomendationPopUp show handleClose={handleClose} onSuccess={jest.fn()} />);

      fireEvent.change(document.getElementById('title')!, { target: { value: 'Draft' } });
      fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));

      expect(handleClose).toHaveBeenCalled();
    });
  });
});
