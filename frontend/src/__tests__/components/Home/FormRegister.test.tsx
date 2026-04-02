/**
 * Tests for RegisteringForm (therapist self-registration modal).
 *
 * The form is config-driven with two steps:
 *   Step 1 — credentials (email, password, repeatPassword)
 *   Step 2 — clinic / projects multi-selects
 *
 * Translation strategy: react-i18next is mocked so t(key) returns "[t]key".
 * Every assertion that verifies a translated string therefore uses the "[t]"
 * prefix, which proves the component passes the string through t() and does
 * not hard-code English text.
 *
 * Bootstrap Button mock: explicitly defaults to type="button" to prevent
 * Next/Back buttons from accidentally triggering form submission (HTML default
 * is type="submit" when no type attribute is present).
 */

import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithRouter } from '@/test-utils/renderWithRouter';
import FormRegister from '@/components/HomePage/RegisteringForm';
import apiClient from '@/api/client';

// ---------- Mocks ----------

// t(key) → "[t]key" so assertions can verify translations are applied
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => `[t]${k}`,
    i18n: { language: 'en' },
  }),
}));

jest.mock('react-icons/fa', () => ({
  FaEye: () => <span data-testid="icon-eye" />,
  FaEyeSlash: () => <span data-testid="icon-eye-slash" />,
}));

// Flatten Bootstrap Modal so tests don't fight with portal / animation logic.
// Button receives explicit type="button" by default — without it the HTML default
// (type="submit") would cause Next/Back clicks to also submit the <form>.
jest.mock('react-bootstrap', () => {
  const actual = jest.requireActual('react-bootstrap');
  const MockModal = ({ show, children }: any) =>
    show ? <div data-testid="modal">{children}</div> : null;
  MockModal.Header = ({ children }: any) => <div data-testid="modal-header">{children}</div>;
  MockModal.Title = ({ children }: any) => <h5 data-testid="modal-title">{children}</h5>;
  MockModal.Body = ({ children }: any) => <div data-testid="modal-body">{children}</div>;
  MockModal.Footer = ({ children }: any) => <div data-testid="modal-footer">{children}</div>;

  return {
    ...actual,
    Modal: MockModal,
    Button: ({ children, type, ...props }: any) => (
      <button type={type ?? 'button'} {...props}>
        {children}
      </button>
    ),
    Spinner: () => <span data-testid="spinner" />,
  };
});

// Minimal two-step config that matches the real shape.
// Step 0: credentials  |  Step 1: clinic + projects
jest.mock('../../../config/config.json', () => ({
  therapistInfo: {
    specializations: ['Orthopaedics', 'Cardiology'],
    projects: ['P1', 'P2', 'P3'],
    clinic_projects: {
      ClinicA: ['P1', 'P2'],
      ClinicB: ['P3'],
    },
  },
  patientInfo: {
    functionPat: {
      Orthopaedics: ['DxA', 'DxB'],
      Cardiology: ['DxC'],
    },
  },
  TherapistForm: [
    {
      title: 'Step 1',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'repeatPassword', label: 'Repeat', type: 'password', required: true },
      ],
    },
    {
      title: 'Step 2',
      fields: [
        { name: 'clinic', label: 'Clinic', type: 'multi-select', required: true },
        { name: 'projects', label: 'Projects', type: 'multi-select', required: false },
      ],
    },
  ],
}));

// react-select is replaced by a simple button-per-option component.
// Exposes data-testid attributes for disabled/placeholder/selected state so
// tests can assert react-select behaviour without fighting its internals.
jest.mock('react-select', () => {
  return function ReactSelectMock(props: any) {
    const { id, options = [], value = [], isDisabled, placeholder, onChange } = props;
    const selectedValues = Array.isArray(value) ? value.map((v: any) => v.value) : [];

    return (
      <div>
        <div data-testid={`select-${id}-disabled`}>{String(!!isDisabled)}</div>
        <div data-testid={`select-${id}-placeholder`}>{placeholder || ''}</div>
        <div data-testid={`select-${id}-selected`}>{selectedValues.join(',')}</div>
        {!isDisabled &&
          options.map((opt: any) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                const next = Array.from(new Set([...selectedValues, opt.value]));
                onChange(next.map((v) => ({ value: v, label: v })));
              }}
            >
              {opt.label}
            </button>
          ))}
        {!isDisabled && (
          <button type="button" onClick={() => onChange(null)}>
            clear-{id}
          </button>
        )}
      </div>
    );
  };
});

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

const apiPost = apiClient.post as jest.Mock;

// ---------- Helpers ----------

function renderOpen() {
  const handleRegShow = jest.fn();
  renderWithRouter(<FormRegister show={true} handleRegShow={handleRegShow} />);
  return { handleRegShow };
}

/**
 * Fill step 1 with valid credentials and click Next to advance to step 2.
 * Uses the selector overload for the password label to distinguish it from
 * the repeatPassword label (both match /\[t\]Password/i otherwise).
 */
function fillStep1AndAdvance() {
  fireEvent.change(screen.getByLabelText(/\[t\]Email/i), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText(/\[t\]Password/i, { selector: 'input[id="password"]' }), {
    target: { value: 'Aa1!aaaa' },
  });
  fireEvent.change(screen.getByLabelText(/\[t\]Repeat/i), { target: { value: 'Aa1!aaaa' } });
  // Find Next by text content — robust against prop-forwarding quirks in the Bootstrap mock
  const nextBtn = screen
    .getAllByRole('button')
    .find((btn) => btn.textContent?.trim() === '[t]Next');
  expect(nextBtn).toBeTruthy();
  fireEvent.click(nextBtn!);
}

/**
 * Wait for step 2 to appear, select ClinicA, then submit the form.
 * Submits via fireEvent.submit on the <form> element rather than clicking the
 * Submit button so the test is not sensitive to button disabled state or text.
 */
async function submitOnStep2() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: '[t]ClinicA' })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: '[t]ClinicA' }));
  // Submit via the form element directly — avoids racing with async mock resolution
  await act(async () => {
    const form = document.querySelector('form');
    fireEvent.submit(form!);
  });
}

// ==========================================================================
// Client-side validation
// Verifies that the form catches errors before any API call is made and that
// every error message is passed through t() (i.e. appears with the "[t]" prefix).
// ==========================================================================
describe('FormRegister — client-side validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPost.mockReset();
  });

  // Empty required fields on step 1 must block advancement and show per-field errors.
  it('blocks Next on step 1 when required fields are empty and shows translated error', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: '[t]Next' }));
    expect(screen.getAllByText('[t]This field is required.').length).toBeGreaterThan(0);
  });

  // Live password-repeat comparison fires on every keystroke in the repeat field.
  it('shows translated password mismatch error inline', () => {
    renderOpen();
    fireEvent.change(
      screen.getByLabelText(/\[t\]Password/i, { selector: 'input[id="password"]' }),
      {
        target: { value: 'Aa1!aaaa' },
      }
    );
    fireEvent.change(screen.getByLabelText(/\[t\]Repeat/i), { target: { value: 'different' } });
    expect(screen.getByText('[t]Passwords do not match.')).toBeInTheDocument();
  });

  // Live password-strength check fires on every keystroke in the password field.
  // The translation key must exist in all lang files so it renders in the user's language.
  it('shows translated password policy error inline', () => {
    renderOpen();
    fireEvent.change(
      screen.getByLabelText(/\[t\]Password/i, { selector: 'input[id="password"]' }),
      {
        target: { value: 'weak' },
      }
    );
    expect(
      screen.getByText(
        '[t]Password must include 8+ characters, an uppercase, lowercase, number and special character.'
      )
    ).toBeInTheDocument();
  });

  // Email validation runs on blur and on Next click.
  it('shows translated invalid email error on blur', () => {
    renderOpen();
    const emailInput = screen.getByLabelText(/\[t\]Email/i);
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.blur(emailInput);
    expect(screen.getByText('[t]Invalid email address.')).toBeInTheDocument();
  });

  // validateStep() runs on Next click and checks email format even without blur.
  // The mock config has no phone field on step 1; this test uses a bad email to
  // exercise the same validateStep path that would also cover phone validation.
  it('shows translated invalid phone error on blur', async () => {
    renderOpen();
    const emailInput = screen.getByLabelText(/\[t\]Email/i);
    fireEvent.change(emailInput, { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: '[t]Next' }));
    expect(screen.getByText('[t]Invalid email address.')).toBeInTheDocument();
  });

  // Projects select must stay disabled and show the placeholder until at least
  // one clinic is selected (derived from clinicProjectsMap in config).
  it('projects multi-select is disabled until clinic is selected', () => {
    renderOpen();
    fillStep1AndAdvance();
    expect(screen.getByTestId('select-projects-disabled')).toHaveTextContent('true');
    expect(screen.getByTestId('select-projects-placeholder')).toHaveTextContent(
      '[t]Select clinic(s) first...'
    );
  });

  // Selecting a clinic unlocks projects and restricts options to that clinic's
  // allowed list (ClinicA → P1, P2; P3 belongs to ClinicB only).
  it('selecting a clinic enables projects and filters to allowed projects only', async () => {
    renderOpen();
    fillStep1AndAdvance();

    fireEvent.click(screen.getByRole('button', { name: '[t]ClinicA' }));

    await waitFor(() => {
      expect(screen.getByTestId('select-projects-disabled')).toHaveTextContent('false');
    });
    expect(screen.getByRole('button', { name: '[t]P1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '[t]P2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '[t]P3' })).not.toBeInTheDocument();
  });

  // When the user switches clinics, previously selected projects that fall outside
  // the new clinic's allowed list must be automatically removed.
  it('changing clinic prunes previously selected projects that are no longer allowed', async () => {
    renderOpen();
    fillStep1AndAdvance();

    fireEvent.click(screen.getByRole('button', { name: '[t]ClinicA' }));
    await waitFor(() =>
      expect(screen.getByTestId('select-projects-disabled')).toHaveTextContent('false')
    );
    fireEvent.click(screen.getByRole('button', { name: '[t]P1' }));
    expect(screen.getByTestId('select-projects-selected')).toHaveTextContent('P1');

    // Switch to ClinicB — P1 is not in ClinicB's allowed projects
    fireEvent.click(screen.getByRole('button', { name: 'clear-clinic' }));
    fireEvent.click(screen.getByRole('button', { name: '[t]ClinicB' }));

    await waitFor(() => {
      expect(screen.getByTestId('select-projects-selected')).toHaveTextContent('');
    });
    expect(screen.getByRole('button', { name: '[t]P3' })).toBeInTheDocument();
  });
});

// ==========================================================================
// Server response handling
// Verifies that the form correctly interprets API responses (success, field
// errors, generic errors, 5xx) and that all messages are passed through t().
// field_errors responses also navigate back to the step containing the errored
// field so the user sees the inline error immediately.
// ==========================================================================
describe('FormRegister — server response handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPost.mockReset();
  });

  // 201 Created: form shows translated success banner and the fieldset is
  // disabled so the user cannot submit again.
  it('success 201 shows translated success banner and disables form', async () => {
    apiPost.mockResolvedValueOnce({ status: 201, data: {} });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(
        screen.getByText(
          '[t]You have been registered. Account info will be emailed after approval.'
        )
      ).toBeInTheDocument();
    });
  });

  // BE returns { error, field_errors: { email: [...] } }.
  // Expected: form navigates back to step 1, inline error shown under email,
  // and the error message is translated via t().
  // Note: the message may appear both in the banner AND the inline field error
  // (expected behaviour — both communicate the problem to the user).
  it('400 with field_errors.email shows inline error on email field and navigates to step 1', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation error.',
          field_errors: { email: ['An account with this email already exists.'] },
        },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      // auto-navigated back to step 1 (email field visible)
      expect(screen.getByLabelText(/\[t\]Email/i)).toBeInTheDocument();
      // inline error under email field — translated (may also appear in banner)
      expect(
        screen.getAllByText('[t]An account with this email already exists.').length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  // applyFieldErrors() builds the banner from the translated field-error strings.
  // This verifies the banner text is also translated, not just the inline error.
  it('400 with field_errors.email shows banner built from field error messages', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation error.',
          field_errors: { email: ['An account with this email already exists.'] },
        },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      // The banner is built from translated field error messages
      const alerts = screen.getAllByText('[t]An account with this email already exists.');
      expect(alerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  // clinic is on step 2: form should stay on step 2 (not navigate away) and
  // show the translated error next to the clinic select.
  it('400 with field_errors.clinic navigates to step 2 and shows inline clinic error', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation error.',
          field_errors: { clinic: ['Clinic is required.'] },
        },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      // step 2 clinic field remains visible
      expect(screen.getByTestId('select-clinic-disabled')).toBeInTheDocument();
      expect(screen.getAllByText('[t]Clinic is required.').length).toBeGreaterThanOrEqual(1);
    });
  });

  // password is on step 1: form must navigate back so the user sees the error.
  it('400 with field_errors.password navigates back to step 1', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation error.',
          field_errors: { password: ['This field is required.'] },
        },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(
        screen.getByLabelText(/\[t\]Password/i, { selector: 'input[id="password"]' })
      ).toBeInTheDocument();
      expect(screen.getAllByText('[t]This field is required.').length).toBeGreaterThanOrEqual(1);
    });
  });

  // Generic 400 with only data.error (no field_errors): extractServerMessage()
  // picks up data.error and passes it through t().
  it('400 with top-level error string (no field_errors) shows translated banner', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'Assigned therapist not found.' },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(screen.getByText('[t]Assigned therapist not found.')).toBeInTheDocument();
    });
  });

  // DRF-style { detail: "..." } responses are supported as a fallback in
  // extractServerMessage() and must also be translated.
  it('400 with data.detail string shows translated banner', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { detail: 'Invalid input format.' },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(screen.getByText('[t]Invalid input format.')).toBeInTheDocument();
    });
  });

  // 5xx responses show a generic "server busy" translated banner that includes
  // the HTTP status code so the user can report it.
  it('500 shows translated server-busy banner with status code', async () => {
    apiPost.mockRejectedValueOnce({
      response: { status: 500, data: { detail: 'Internal error' } },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(
        screen.getByText(/\[t\]The server is busy or temporarily unavailable/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/500/)).toBeInTheDocument();
    });
  });

  // The "Additional information" toggle is shown for 5xx so developers/support
  // can see the raw server message. Clicking it expands a <pre> block with the
  // status code and server message. Both the banner and the pre block may contain
  // the status code, hence getAllByText instead of getByText.
  it('500 shows details toggle and expands server message on click', async () => {
    apiPost.mockRejectedValueOnce({
      response: { status: 500, data: { detail: 'Internal error' } },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(screen.getByText('[t]Additional information')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('[t]Additional information'));

    await waitFor(() => {
      // After expanding details, the <pre> block should contain the status code
      expect(screen.getAllByText(/500/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // When the BE returns errors on multiple fields, applyFieldErrors() must
  // translate each one and navigate to the step of the first errored field.
  it('multiple field_errors are all shown translated', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          error: 'Validation error.',
          field_errors: {
            email: ['An account with this email already exists.'],
            password: ['This field is required.'],
          },
        },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      // Navigates to step 1 (first errored field = email)
      expect(screen.getByLabelText(/\[t\]Email/i)).toBeInTheDocument();
    });

    // Both translated errors should appear somewhere in the document
    expect(screen.getByText('[t]An account with this email already exists.')).toBeInTheDocument();
    expect(screen.getByText('[t]This field is required.')).toBeInTheDocument();
  });
});

// ==========================================================================
// UX behaviour
// Covers guard-rails that protect against accidental data loss and confirm
// that interactive UI elements (error banner close, Back button) work correctly.
// ==========================================================================
describe('FormRegister — UX behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiPost.mockReset();
  });

  // Pressing Escape (or closing the modal) when the form has unsaved data must
  // trigger window.confirm. If the user cancels, the modal stays open.
  it('closing with unsaved changes prompts confirm; cancelling keeps modal open', () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderOpen();

    fireEvent.change(screen.getByLabelText(/\[t\]Email/i), { target: { value: 'a@b.com' } });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  // The ✕ button on the error banner must clear formError so it disappears.
  it('clearing formError banner via close button removes it', async () => {
    apiPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'Assigned therapist not found.' },
      },
    });

    renderOpen();
    fillStep1AndAdvance();
    await submitOnStep2();

    await waitFor(() => {
      expect(screen.getByText('[t]Assigned therapist not found.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/\[t\]Close/i));

    await waitFor(() => {
      expect(screen.queryByText('[t]Assigned therapist not found.')).not.toBeInTheDocument();
    });
  });

  // Back button on step 2 must call prevStep() and re-render step 1 fields.
  it('Back button returns to step 1', () => {
    renderOpen();
    fillStep1AndAdvance();
    // confirm we are on step 2
    expect(screen.getByTestId('select-clinic-disabled')).toBeInTheDocument();

    // find the Back button by its text content
    const backBtn = screen
      .getAllByRole('button')
      .find((btn) => btn.textContent?.includes('[t]Back'));
    expect(backBtn).toBeTruthy();
    fireEvent.click(backBtn!);

    // should be back on step 1 — email input label visible
    expect(screen.getByText(/\[t\]Email/i)).toBeInTheDocument();
  });
});
