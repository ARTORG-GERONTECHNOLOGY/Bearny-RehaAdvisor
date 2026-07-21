import React from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  default: ({ children, footer, show, onHide }: any) =>
    show ? (
      <div>
        <button aria-label="trigger-onhide" onClick={onHide}>
          trigger-onhide
        </button>
        {children}
        {footer}
      </div>
    ) : null,
}));

// react-select is complex — stub to a plain native select for single-select usage,
// and to a set of toggle buttons (one per option) for isMulti usage so
// handleMultiChange(field, selectedOptions[]) gets exercised realistically.
// Every isMulti field in the component passes an explicit inputId (inputFrom,
// aims, topics, where, setting, primaryDiagnosis), so each renders with its own
// "select-<inputId>" testid; "select-multi" is only a fallback for an inputId-less
// instance, which doesn't currently occur in this form.
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
          {/* Mirrors react-select's real "clear all" behavior, which calls onChange(null) */}
          <button type="button" aria-label="clear-multi" onClick={() => onChange(null)}>
            clear
          </button>
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

// Radix Select/Checkbox rely on ResizeObserver, pointer capture APIs, and
// scrollIntoView, none of which jsdom implements.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = jest.fn();
  Element.prototype.releasePointerCapture = jest.fn();
  Element.prototype.scrollIntoView = jest.fn();
});

// ------------------------------------------------------------------
// Helpers for interacting with the shadcn (Radix) Select instances.
// Each one renders as a `<button role="combobox">` trigger; its options
// only exist in the DOM (via a portal) once opened.
// ------------------------------------------------------------------

/** Opens the Select whose trigger has the given accessible name, then picks an option. */
const selectViaCombobox = async (
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string,
  optionName: string
) => {
  await user.click(screen.getByRole('combobox', { name: triggerName }));
  await user.click(await screen.findByRole('option', { name: optionName }));
};

const selectContentType = (user: ReturnType<typeof userEvent.setup>, value: string) =>
  selectViaCombobox(user, 'Content type', value);

/**
 * The per-media-row "Kind" and "Media type" selects have no associated
 * <label htmlFor>, so they can't be targeted by accessible name. Instead,
 * scope to the row container (identified by its "Media item #N" heading)
 * and pick the combobox by position: 0 = Kind, 1 = Media type.
 */
const getMediaRowCombobox = (rowIndex: number, comboIndex: 0 | 1) => {
  const heading = screen.getByText(`Media item #${rowIndex + 1}`);
  const row = heading.closest('.border') as HTMLElement;
  return within(row).getAllByRole('combobox')[comboIndex];
};

const selectMediaKind = async (
  user: ReturnType<typeof userEvent.setup>,
  rowIndex: number,
  optionName: string
) => {
  await user.click(getMediaRowCombobox(rowIndex, 0));
  await user.click(await screen.findByRole('option', { name: optionName }));
};

const selectMediaType = async (
  user: ReturnType<typeof userEvent.setup>,
  rowIndex: number,
  optionName: string
) => {
  await user.click(getMediaRowCombobox(rowIndex, 1));
  await user.click(await screen.findByRole('option', { name: optionName }));
};

/** The "Assign to Patient" select is disabled until patients finish loading. */
const openPatientSelect = async (user: ReturnType<typeof userEvent.setup>) => {
  const trigger = await screen.findByRole('combobox', { name: 'Assign to Patient' });
  await waitFor(() => expect(trigger).not.toBeDisabled());
  await user.click(trigger);
};

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
    it('contains all 6 supported languages including PT and NL', async () => {
      const user = userEvent.setup();
      renderPopup();

      await user.click(screen.getByRole('combobox', { name: 'Language' }));

      expect(await screen.findByRole('option', { name: 'DE — Deutsch' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'EN — English' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'FR — Français' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'IT — Italiano' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'PT — Português' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'NL — Nederlands' })).toBeInTheDocument();
    });

    it('defaults to English', () => {
      renderPopup();
      const trigger = screen.getByRole('combobox', { name: 'Language' });
      expect(trigger).toHaveTextContent('EN — English');
    });
  });

  describe('Content type dropdown', () => {
    it('shows the taxonomy labels including brochure and graphics', async () => {
      const user = userEvent.setup();
      renderPopup();

      await user.click(screen.getByRole('combobox', { name: 'Content type' }));

      expect(await screen.findByRole('option', { name: 'brochure' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'graphics' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'video' })).toBeInTheDocument();
    });

    it('does not show backend canonical names like pdf or image as options', async () => {
      const user = userEvent.setup();
      renderPopup();

      await user.click(screen.getByRole('combobox', { name: 'Content type' }));
      // Wait for the listbox to actually open before asserting on absence.
      await screen.findByRole('option', { name: 'brochure' });

      expect(screen.queryByRole('option', { name: 'pdf' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'image' })).not.toBeInTheDocument();
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

    it('renders the original taxonomy values in the dropdown', async () => {
      const user = userEvent.setup();
      renderPopup();

      await user.click(screen.getByRole('combobox', { name: 'Content type' }));
      await screen.findByRole('option', { name: ORIGINAL_CONTENT_TYPES[0] });

      const options = screen.getAllByRole('option');
      expect(options.map((o) => o.textContent)).toEqual(['Select', ...ORIGINAL_CONTENT_TYPES]);
    });

    it('shows each original label as option text', async () => {
      const user = userEvent.setup();
      renderPopup();

      await user.click(screen.getByRole('combobox', { name: 'Content type' }));

      for (const ct of ORIGINAL_CONTENT_TYPES) {
        expect(await screen.findByRole('option', { name: ct })).toBeInTheDocument();
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
      const user = userEvent.setup();
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

      await selectContentType(user, contentTypeValue);

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
      expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument();
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

      expect(screen.getByText('Duration seems too high (max 600 minutes).')).toBeInTheDocument();
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

      expect(screen.getByText('URL must start with http:// or https://')).toBeInTheDocument();
    });

    it('rejects a media URL that cannot be parsed as a URL at all', async () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      fireEvent.change(screen.getByPlaceholderText('https://...'), {
        target: { value: 'not a url at all' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(screen.getByText('URL must start with http:// or https://')).toBeInTheDocument();
    });

    it('requires a file when the media kind is "Upload file"', async () => {
      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));

      await selectMediaKind(user, 0, 'Upload file');

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
  // Field-level error clearing
  // ------------------------------------------------------------------
  describe('field-level error clearing', () => {
    it('clears the title error as soon as the user edits the title field', async () => {
      renderPopup();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });
      expect(screen.getByText('Title is required')).toBeInTheDocument();

      fireEvent.change(document.getElementById('title')!, { target: { value: 'A title' } });

      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });

    it('clears a media row error when a sibling field on that row is edited', async () => {
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });
      expect(screen.getByText('URL is required')).toBeInTheDocument();

      const providerInput = screen.getByPlaceholderText('spotify / youtube / etc.');
      fireEvent.change(providerInput, { target: { value: 'spotify' } });

      expect(screen.queryByText('URL is required')).not.toBeInTheDocument();
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

    it('shows a URL field for "External link" kind and a file field for "Upload file" kind', async () => {
      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      expect(screen.getByPlaceholderText('https://...')).toBeInTheDocument();

      await selectMediaKind(user, 0, 'Upload file');

      expect(screen.queryByPlaceholderText('https://...')).not.toBeInTheDocument();
      expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
    });

    it('rejects a media file larger than 1GB', async () => {
      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      await selectMediaKind(user, 0, 'Upload file');

      const bigFile = new File(['x'], 'big.mp4', { type: 'video/mp4' });
      Object.defineProperty(bigFile, 'size', { value: 1024 * 1024 * 1024 + 1 });

      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [bigFile] },
      });

      expect(screen.getByText('File is too large (max 1GB).')).toBeInTheDocument();
    });

    it('accepts a media file under the 1GB limit without an error', async () => {
      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      await selectMediaKind(user, 0, 'Upload file');

      const smallFile = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      Object.defineProperty(smallFile, 'size', { value: 1024 });

      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [smallFile] },
      });

      expect(screen.queryByText('File is too large (max 1GB).')).not.toBeInTheDocument();
    });

    it('updates the media type and title fields on a media row', async () => {
      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));

      await selectMediaType(user, 0, 'Audio');
      expect(getMediaRowCombobox(0, 1)).toHaveTextContent('Audio');

      const titleLabel = screen.getByText('Title (optional)');
      const mediaTitleInput = titleLabel.parentElement!.querySelector(
        'input[type="text"]'
      ) as HTMLInputElement;
      fireEvent.change(mediaTitleInput, { target: { value: 'My clip' } });
      expect(mediaTitleInput.value).toBe('My clip');
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

      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      await openPatientSelect(user);
      expect(await screen.findByRole('option', { name: 'PAT-1' })).toBeInTheDocument();
    });

    it('shows a load error and lets the user retry', async () => {
      (mockApiClient.get as jest.Mock).mockRejectedValueOnce(new Error('network down'));

      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      expect(await screen.findByText('Failed to fetch patients.')).toBeInTheDocument();

      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ _id: 'p1', patient_code: 'PAT-1' }],
      });
      fireEvent.click(screen.getByRole('button', { name: /Reload/i }));

      await openPatientSelect(user);
      expect(await screen.findByRole('option', { name: 'PAT-1' })).toBeInTheDocument();
    });

    it('resets the assigned patient when unchecking private', () => {
      renderPopup();
      const checkbox = screen.getByLabelText(/Make this a private intervention/i);
      fireEvent.click(checkbox);
      fireEvent.click(checkbox);
      expect(screen.queryByLabelText(/Assign to Patient/i)).not.toBeInTheDocument();
    });

    it('shows a missing-therapist-id error and skips the fetch when authStore has no id', async () => {
      const authStore = (jest.requireMock('@/stores/authStore') as any).default;
      const originalId = authStore.id;
      authStore.id = '';

      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      expect(await screen.findByText('Missing therapist id.')).toBeInTheDocument();
      expect(mockApiClient.get).not.toHaveBeenCalled();

      authStore.id = originalId;
    });
  });

  // ------------------------------------------------------------------
  // Multi-select taxonomy fields
  // ------------------------------------------------------------------
  describe('multi-select taxonomy fields', () => {
    it('toggles a value on and off in the Aims field', () => {
      renderPopup();
      // Each generic multi-select now renders with its own react-select `inputId`
      // (e.g. inputId="aims"), so the mock gives it a dedicated "select-aims"
      // testid rather than the generic "select-multi" bucket.
      const aims = screen.getByTestId('select-aims');

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
      expect(within(diagnosisSelect).getByText('Stroke')).toHaveAttribute('data-selected', 'true');
    });

    it('toggles a value in the Input from field', () => {
      renderPopup();
      const inputFrom = screen.getByTestId('select-inputFrom');
      fireEvent.click(within(inputFrom).getByText('Patient'));
      expect(within(inputFrom).getByText('Patient')).toHaveAttribute('data-selected', 'true');
    });

    it('toggles a value in the Topics field', () => {
      renderPopup();
      const topics = screen.getByTestId('select-topics');
      fireEvent.click(within(topics).getByText('Disease'));
      expect(within(topics).getByText('Disease')).toHaveAttribute('data-selected', 'true');
    });

    it('toggles a value in the Where field', () => {
      renderPopup();
      const where = screen.getByTestId('select-where');
      fireEvent.click(within(where).getByText('Home'));
      expect(within(where).getByText('Home')).toHaveAttribute('data-selected', 'true');
    });

    it('toggles a value in the Setting field', () => {
      renderPopup();
      const setting = screen.getByTestId('select-setting');
      fireEvent.click(within(setting).getByText('Individual'));
      expect(within(setting).getByText('Individual')).toHaveAttribute('data-selected', 'true');
    });

    it('selects an original language from the dropdown', async () => {
      const user = userEvent.setup();
      renderPopup();

      await selectViaCombobox(user, 'Original language', 'de');

      expect(screen.getByRole('combobox', { name: 'Original language' })).toHaveTextContent('de');
    });
  });

  // ------------------------------------------------------------------
  // Successful submission payload
  // ------------------------------------------------------------------
  describe('successful submission', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
      fireEvent.change(document.getElementById('title')!, {
        target: { value: 'Breathing Exercise' },
      });
      fireEvent.change(document.getElementById('description')!, {
        target: { value: 'A calming exercise' },
      });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '15' } });
      await selectContentType(user, 'video');
    };

    it('submits a well-formed FormData payload and shows the success alert', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });
      const onSuccess = jest.fn();
      const user = userEvent.setup();
      render(<AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={onSuccess} />);

      await fillRequiredFields(user);

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

    it('appends the media file to the payload for a file-kind media row', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });
      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);

      fireEvent.click(screen.getByRole('button', { name: /Add media/i }));
      await selectMediaKind(user, 0, 'Upload file');

      const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 1024 });
      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [file] },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
      const formData: FormData = (mockApiClient.post as jest.Mock).mock.calls[0][1];
      expect(formData.get('media_file_0')).toBeInstanceOf(File);
    });

    it('includes the patientId in the payload when private', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({
        data: [{ _id: 'p1', patient_code: 'PAT-1' }],
      });
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({ status: 201, data: {} });

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      await openPatientSelect(user);
      await user.click(await screen.findByRole('option', { name: 'PAT-1' }));

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

    const fillRequiredFields = async (user: ReturnType<typeof userEvent.setup>) => {
      fireEvent.change(document.getElementById('title')!, { target: { value: 'X' } });
      fireEvent.change(document.getElementById('description')!, { target: { value: 'Y' } });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '10' } });
      await selectContentType(user, 'video');
    };

    it('maps field_errors onto the form and shows a details toggle', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 400,
        data: { field_errors: { title: ['Already exists'] } },
      });

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
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

    it('clears a backend field error for a multi-select taxonomy field once it is edited', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 400,
        data: { field_errors: { aims: ['Pick at least one aim'] } },
      });

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(await screen.findByText(/Pick at least one aim/)).toBeInTheDocument();

      const aims = screen.getByTestId('select-aims');
      fireEvent.click(within(aims).getByText('Education'));

      expect(screen.queryByText(/Pick at least one aim/)).not.toBeInTheDocument();
    });

    it('shows non_field_errors as the banner message', async () => {
      (mockApiClient.post as jest.Mock).mockResolvedValueOnce({
        status: 400,
        data: { non_field_errors: ['Duplicate external_id for this language.'] },
      });

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(
        await screen.findByText('Duplicate external_id for this language.')
      ).toBeInTheDocument();
    });

    it('extracts the message from a genuine axios error response', async () => {
      (mockApiClient.post as jest.Mock).mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { message: 'Server exploded' } },
      });

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
      });

      expect(await screen.findByText('Server exploded')).toBeInTheDocument();
    });

    it('shows a generic error message when the request throws a non-axios error', async () => {
      (mockApiClient.post as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const user = userEvent.setup();
      renderPopup();
      await fillRequiredFields(user);
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

    it('does not close while a submission is in flight', async () => {
      let resolvePost: (v: unknown) => void = () => {};
      (mockApiClient.post as jest.Mock).mockReturnValueOnce(
        new Promise((res) => {
          resolvePost = res;
        })
      );
      const handleClose = jest.fn();
      const user = userEvent.setup();
      render(<AddRecomendationPopUp show handleClose={handleClose} onSuccess={jest.fn()} />);

      fireEvent.change(document.getElementById('title')!, { target: { value: 'X' } });
      fireEvent.change(document.getElementById('description')!, { target: { value: 'Y' } });
      fireEvent.change(document.getElementById('duration')!, { target: { value: '10' } });
      await selectContentType(user, 'video');

      fireEvent.click(screen.getByRole('button', { name: /submit/i }));

      fireEvent.click(screen.getByRole('button', { name: 'trigger-onhide' }));
      expect(handleClose).not.toHaveBeenCalled();

      resolvePost({ status: 201, data: {} });
      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());
    });

    it('does not call authStore.checkAuthentication when the modal is not shown', () => {
      const authStore = (jest.requireMock('@/stores/authStore') as any).default;
      (authStore.checkAuthentication as jest.Mock).mockClear();

      render(<AddRecomendationPopUp show={false} handleClose={jest.fn()} onSuccess={jest.fn()} />);

      expect(authStore.checkAuthentication).not.toHaveBeenCalled();
    });

    it('resets the form when the modal is closed and reopened', () => {
      const { rerender } = render(
        <AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={jest.fn()} />
      );
      fireEvent.change(document.getElementById('title')!, { target: { value: 'Draft' } });

      rerender(
        <AddRecomendationPopUp show={false} handleClose={jest.fn()} onSuccess={jest.fn()} />
      );
      rerender(<AddRecomendationPopUp show handleClose={jest.fn()} onSuccess={jest.fn()} />);

      expect((document.getElementById('title') as HTMLInputElement).value).toBe('');
    });
  });

  // ------------------------------------------------------------------
  // Miscellaneous fallback branches
  // ------------------------------------------------------------------
  describe('fallback branches', () => {
    it('treats a malformed (non-array) patients response as an empty list', async () => {
      (mockApiClient.get as jest.Mock).mockResolvedValueOnce({ data: null });

      const user = userEvent.setup();
      renderPopup();
      fireEvent.click(screen.getByLabelText(/Make this a private intervention/i));

      await waitFor(() => expect(mockApiClient.get).toHaveBeenCalled());
      await openPatientSelect(user);
      expect(screen.queryByRole('option', { name: 'PAT-1' })).not.toBeInTheDocument();
    });

    it('clears a multi-select taxonomy field entirely when cleared', () => {
      renderPopup();
      const aims = screen.getByTestId('select-aims');

      fireEvent.click(within(aims).getByText('Education'));
      expect(within(aims).getByText('Education')).toHaveAttribute('data-selected', 'true');

      fireEvent.click(within(aims).getByLabelText('clear-multi'));
      expect(within(aims).getByText('Education')).toHaveAttribute('data-selected', 'false');
    });
  });
});
