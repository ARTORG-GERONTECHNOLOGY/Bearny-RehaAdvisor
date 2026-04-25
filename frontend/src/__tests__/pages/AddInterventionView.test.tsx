import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

// Resolved after jest.mock hoisting; type-cast so .mockResolvedValue etc. are available.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockApiClient = require('@/__mocks__/api/client').default as {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
  delete: jest.Mock;
};

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

jest.mock('@/components/common/Header', () => () => null);
jest.mock('@/components/common/Footer', () => () => null);

import AddInterventionView from '@/pages/AddInterventionView';

const renderPage = () =>
  render(
    <MemoryRouter>
      <AddInterventionView />
    </MemoryRouter>
  );

describe('AddInterventionView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: successful submission
    mockApiClient.post.mockResolvedValue({ status: 200, data: { success: true } });
  });

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

  // ── Duration field ─────────────────────────────────────────────────────────

  describe('Duration field', () => {
    it('renders with a default value of 30 minutes', () => {
      renderPage();
      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      expect(input.value).toBe('30');
    });

    it('reflects changes to the duration value', () => {
      renderPage();
      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '45' } });
      expect(input.value).toBe('45');
    });

    it('clamps the value to a minimum of 1 when 0 is entered', () => {
      renderPage();
      const input = screen.getByRole('spinbutton') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '0' } });
      expect(parseInt(input.value)).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Form submission — payload ──────────────────────────────────────────────

  describe('Form submission', () => {
    /**
     * Fill minimum required fields and return a helper that submits the form.
     * `fireEvent.click` on a submit button does not trigger form submission in
     * jsdom — `fireEvent.submit` on the <form> element is required.
     */
    const fillAndSubmit = () => {
      fireEvent.change(screen.getByLabelText('InterventionTitle'), {
        target: { value: 'Test Intervention' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'A test description.' },
      });
      const form = document.querySelector('form')!;
      fireEvent.submit(form);
    };

    it('sends duration in the FormData payload', async () => {
      renderPage();

      // Change duration to 60 before submitting
      const durationInput = screen.getByRole('spinbutton') as HTMLInputElement;
      fireEvent.change(durationInput, { target: { value: '60' } });

      fillAndSubmit();

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());

      const formData: FormData = mockApiClient.post.mock.calls[0][1];
      expect(formData.get('duration')).toBe('60');
    });

    it('sends the default duration of 30 when the field is unchanged', async () => {
      renderPage();
      fillAndSubmit();

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());

      const formData: FormData = mockApiClient.post.mock.calls[0][1];
      expect(formData.get('duration')).toBe('30');
    });

    it('displays backend field_errors when the server returns a 400', async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            message: 'Validation error.',
            field_errors: { duration: ['Duration must be greater than 0.'] },
          },
        },
      };
      mockApiClient.post.mockRejectedValueOnce(axiosError);

      renderPage();
      fillAndSubmit();

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Validation error/i));
      expect(screen.getByRole('alert')).toHaveTextContent(/duration/i);
    });

    it('shows a generic error when the server returns a non-axios error', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'));

      renderPage();
      fillAndSubmit();

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Unexpectederror/i));
    });
  });

  // ── File upload (E2E-style with real test-data filename) ──────────────────
  //
  // The source file (`Combinatieoefeningen 1.MP4`) is 392 MB — too large to
  // load into jsdom.  We use a File stub with the same name and MIME type but
  // small placeholder content so we can verify the full form submission path
  // without hitting memory limits.  The backend test
  // `test_add_new_intervention_arbitrary_filename` covers the server-side
  // handling with a SimpleUploadedFile using the same filename.

  describe('File upload — Combinatieoefeningen 1.MP4', () => {
    const FILE_NAME = 'Combinatieoefeningen 1.MP4';
    const FILE_MIME = 'video/mp4';

    /** Small stub: real filename + MIME, minimal content. */
    const makeStubFile = () =>
      new File([new Uint8Array([0x00, 0x00, 0x00, 0x18])], FILE_NAME, { type: FILE_MIME });

    it('sends the file as media_file in the FormData with correct name and MIME', async () => {
      renderPage();

      fireEvent.change(screen.getByLabelText('InterventionTitle'), {
        target: { value: 'Combinatieoefeningen' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Combination exercises video.' },
      });

      const file = makeStubFile();
      const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());

      const [endpoint, formData] = mockApiClient.post.mock.calls[0];
      expect(endpoint).toBe('interventions/add');
      expect(formData.get('title')).toBe('Combinatieoefeningen');
      expect(formData.get('duration')).toBe('30');

      const submitted = formData.get('media_file') as File;
      expect(submitted).toBeInstanceOf(File);
      expect(submitted.name).toBe(FILE_NAME);
      expect(submitted.type).toBe(FILE_MIME);
    });

    it('includes duration and content type in the same submission as the file', async () => {
      renderPage();

      fireEvent.change(screen.getByLabelText('InterventionTitle'), {
        target: { value: 'Combinatieoefeningen' },
      });
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Combination exercises video.' },
      });

      const durationInput = screen.getByRole('spinbutton') as HTMLInputElement;
      fireEvent.change(durationInput, { target: { value: '15' } });

      const file = makeStubFile();
      const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      fireEvent.submit(document.querySelector('form')!);

      await waitFor(() => expect(mockApiClient.post).toHaveBeenCalled());

      const formData: FormData = mockApiClient.post.mock.calls[0][1];
      expect(formData.get('duration')).toBe('15');
      expect(formData.get('contentType')).toBe('blog'); // default
      expect(formData.get('media_file')).toBeInstanceOf(File);
    });

    it('does not show a client-side error when a video/mp4 file is attached', () => {
      renderPage();

      const file = makeStubFile();
      const fileInput = screen.getByLabelText('UploadMediaFile') as HTMLInputElement;
      fireEvent.change(fileInput, { target: { files: [file] } });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
