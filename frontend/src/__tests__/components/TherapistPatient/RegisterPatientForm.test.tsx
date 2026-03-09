// src/__tests__/components/TherapistPatient/RegisterPatientForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FormRegisterPatient from '@/components/AddPatient/RegisterPatientForm';
import '@testing-library/jest-dom';

jest.mock('@/api/client', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(() => Promise.resolve({ data: { clinics: [], projects: [] } })),
  },
}));

const renderComponent = () => render(<FormRegisterPatient therapist="therapist1" />);

describe('FormRegisterPatient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the first step correctly', () => {
    renderComponent();
    // Use the actual text from your translations or config
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      /Personal Information|Patient Information/i
    );
  });

  it('shows validation errors if required fields are empty on next', async () => {
    renderComponent();
    fireEvent.click(screen.getByText(/Next/i));
    await waitFor(() => {
      expect(screen.getAllByText(/is required/i).length).toBeGreaterThan(0);
    });
  });

  it('navigates forward and backward between steps', async () => {
    renderComponent();

    // Fill out required fields for the first step
    fireEvent.change(screen.getByLabelText(/^Email Address/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password/i, { selector: 'input[id="password"]' }), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/^Last Name/i), { target: { value: 'Tim' } });
    fireEvent.change(screen.getByLabelText(/^First Name/i), { target: { value: 'Tim' } });

    fireEvent.click(screen.getByText('Next')); // Move forward

    // Wait for "Back" button to appear after navigating forward
    await waitFor(() => expect(screen.getByText('Back')).toBeInTheDocument());

    // Now you can safely click "Back"
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent(
      /Personal Information|Patient Information/i
    );
  });

  it('validates email and phone formats', async () => {
    renderComponent();
    fireEvent.change(screen.getByLabelText(/^Email Address/i), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByLabelText(/^Phone Number/i), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByText(/Next/i));

    await waitFor(() => {
      expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
      expect(screen.getByText(/Invalid phone number/i)).toBeInTheDocument();
    });
  });
});
