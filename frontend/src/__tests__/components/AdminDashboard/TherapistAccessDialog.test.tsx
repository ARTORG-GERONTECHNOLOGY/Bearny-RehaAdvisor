import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TherapistAccessDialog from '@/components/AdminDashboard/TherapistAccessDialog';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const defaultProps = {
  open: true,
  therapistName: 'Jane Doe',
  loading: false,
  error: null as string | null,
  success: null as string | null,
  availableProjects: ['COPAIN', 'OtherProject'],
  allowedClinics: ['Inselspital'],
  selectedProjects: ['COPAIN'],
  selectedClinics: ['Inselspital'],
  onToggleProject: jest.fn(),
  onToggleClinic: jest.fn(),
  onClose: jest.fn(),
  onSave: jest.fn(),
  onDismissError: jest.fn(),
  onDismissSuccess: jest.fn(),
};

describe('TherapistAccessDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<TherapistAccessDialog {...defaultProps} open={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the therapist name in the title', () => {
    render(<TherapistAccessDialog {...defaultProps} />);
    expect(screen.getByText(/Therapist access/)).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('shows a loading indicator instead of the form while loading', () => {
    render(<TherapistAccessDialog {...defaultProps} loading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByLabelText('COPAIN')).not.toBeInTheDocument();
  });

  it('renders project and clinic checkboxes with correct checked state', () => {
    render(<TherapistAccessDialog {...defaultProps} />);
    expect(screen.getByLabelText('COPAIN')).toBeChecked();
    expect(screen.getByLabelText('OtherProject')).not.toBeChecked();
    expect(screen.getByLabelText('Inselspital')).toBeChecked();
  });

  it('calls onToggleProject and onToggleClinic when checkboxes are clicked', () => {
    render(<TherapistAccessDialog {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('OtherProject'));
    expect(defaultProps.onToggleProject).toHaveBeenCalledWith('OtherProject');

    fireEvent.click(screen.getByLabelText('Inselspital'));
    expect(defaultProps.onToggleClinic).toHaveBeenCalledWith('Inselspital');
  });

  it('shows a message instead of clinic checkboxes when no project is selected', () => {
    render(<TherapistAccessDialog {...defaultProps} selectedProjects={[]} allowedClinics={[]} />);
    expect(screen.getByText('Select a project to see available clinics.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Inselspital')).not.toBeInTheDocument();
  });

  it('shows a warning when a project has no configured clinics', () => {
    render(<TherapistAccessDialog {...defaultProps} allowedClinics={[]} />);
    expect(
      screen.getByText('No clinics are configured for the selected project(s).')
    ).toBeInTheDocument();
  });

  it('shows a warning when there are no available projects', () => {
    render(<TherapistAccessDialog {...defaultProps} availableProjects={[]} />);
    expect(screen.getByText('No projects configured on the server.')).toBeInTheDocument();
  });

  it('disables Save when no project is selected', () => {
    render(<TherapistAccessDialog {...defaultProps} selectedProjects={[]} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onSave when Save is clicked', () => {
    render(<TherapistAccessDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it('calls onClose when the footer Close button is clicked', () => {
    render(<TherapistAccessDialog {...defaultProps} />);
    // Two buttons share the "Close" accessible name: the header icon-only close
    // and the footer text button — pick the one without an icon.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerClose = closeButtons.find((b) => !b.querySelector('svg'))!;
    fireEvent.click(footerClose);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('shows and dismisses an error alert', () => {
    render(<TherapistAccessDialog {...defaultProps} error="Failed to load." />);
    expect(screen.getByText('Failed to load.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close alert' }));
    expect(defaultProps.onDismissError).toHaveBeenCalled();
  });

  it('shows and dismisses a success alert', () => {
    render(<TherapistAccessDialog {...defaultProps} success="Saved successfully." />);
    expect(screen.getByText('Saved successfully.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close alert' }));
    expect(defaultProps.onDismissSuccess).toHaveBeenCalled();
  });

  it('hides the header close (X) button while loading, keeping only the footer Close button', () => {
    render(<TherapistAccessDialog {...defaultProps} loading />);
    // The footer "Close" button remains (disabled); the icon-only header close is hidden via hideClose.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    expect(closeButtons).toHaveLength(1);
    expect(closeButtons[0]).toBeDisabled();
  });
});
