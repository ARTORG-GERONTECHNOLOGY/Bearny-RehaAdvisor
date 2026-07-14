import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ImportFromRedcapModal, {
  Candidate,
} from '@/components/TherapistPatientPage/ImportFromRedcapModal';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  project: 'ProjA',
  record_id: 'rec-1',
  pat_id: 'P01',
  identifier: 'P01',
  ...overrides,
});

const defaultProps = {
  show: true,
  onHide: jest.fn(),
  loading: false,
  error: '',
  candidates: [] as Candidate[],
  rowPasswords: {} as Record<string, string>,
  setRowPassword: jest.fn(),
  importingKey: null as string | null,
  importedKeys: {} as Record<string, boolean>,
  onRefresh: jest.fn(),
  onImportOne: jest.fn(),
};

describe('ImportFromRedcapModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  describe('rendering', () => {
    it('renders the modal title', () => {
      render(<ImportFromRedcapModal {...defaultProps} />);
      expect(screen.getByText('Import patients from REDCap')).toBeInTheDocument();
    });

    it('does not render when show=false', () => {
      render(<ImportFromRedcapModal {...defaultProps} show={false} />);
      expect(screen.queryByText('Import patients from REDCap')).not.toBeInTheDocument();
    });

    it('shows a loading spinner while loading', () => {
      render(<ImportFromRedcapModal {...defaultProps} loading={true} />);
      expect(screen.getByText('Loading candidates…')).toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('shows an empty-state message when there are no candidates', () => {
      render(<ImportFromRedcapModal {...defaultProps} />);
      expect(
        screen.getByText('No importable patients found for your clinic/projects.')
      ).toBeInTheDocument();
    });

    it('shows an error alert when error is set', () => {
      render(<ImportFromRedcapModal {...defaultProps} error="Something broke" />);
      expect(screen.getByText('Something broke')).toBeInTheDocument();
    });

    it('shows the candidate count badge', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate(), candidate({ identifier: 'P02', pat_id: 'P02' })]}
        />
      );
      expect(screen.getByText(/2.*found/)).toBeInTheDocument();
    });

    it('falls back to an empty array when candidates is not an array', () => {
      render(
        <ImportFromRedcapModal {...defaultProps} candidates={undefined as unknown as Candidate[]} />
      );
      expect(
        screen.getByText('No importable patients found for your clinic/projects.')
      ).toBeInTheDocument();
    });

    it('falls back gracefully when rowPasswords/importedKeys are not objects', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={undefined as unknown as Record<string, string>}
          importedKeys={null as unknown as Record<string, boolean>}
        />
      );
      expect(screen.getByPlaceholderText('TempPass123!')).toHaveValue('');
      expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Candidate rows
  // ------------------------------------------------------------------
  describe('candidate rows', () => {
    it('renders the patient id, record id, and project', () => {
      render(<ImportFromRedcapModal {...defaultProps} candidates={[candidate()]} />);
      expect(screen.getByText('P01')).toBeInTheDocument();
      expect(screen.getByText('rec-1')).toBeInTheDocument();
      expect(screen.getByText('ProjA')).toBeInTheDocument();
    });

    it('shows a "record only" badge when there is no pat_id', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate({ pat_id: '', identifier: 'rec-only' })]}
        />
      );
      expect(screen.getByText('record only')).toBeInTheDocument();
    });

    it('falls back to the identifier when there is no record_id', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate({ record_id: '', identifier: 'ident-1' })]}
        />
      );
      expect(screen.getByText('ident-1')).toBeInTheDocument();
    });

    it('shows a "—" placeholder when neither record_id nor identifier is present', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate({ record_id: '', identifier: '' })]}
        />
      );
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows the DAG badge when present', () => {
      render(
        <ImportFromRedcapModal {...defaultProps} candidates={[candidate({ dag: 'site-1' })]} />
      );
      expect(screen.getByText(/DAG: site-1/)).toBeInTheDocument();
    });

    it('shows the password hint for a patient record', () => {
      render(<ImportFromRedcapModal {...defaultProps} candidates={[candidate()]} />);
      expect(screen.getByText('Password for this patient.')).toBeInTheDocument();
    });

    it('shows the password hint for a record-only entry', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate({ pat_id: '', identifier: 'rec-only' })]}
        />
      );
      expect(screen.getByText('Password for this record-only patient.')).toBeInTheDocument();
    });

    it('reflects the row password value from props', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': 'Secret1!' }}
        />
      );
      expect(screen.getByDisplayValue('Secret1!')).toBeInTheDocument();
    });

    it('calls setRowPassword with the row key on change', () => {
      render(<ImportFromRedcapModal {...defaultProps} candidates={[candidate()]} />);
      fireEvent.change(screen.getByPlaceholderText('TempPass123!'), {
        target: { value: 'NewPass1!' },
      });
      expect(defaultProps.setRowPassword).toHaveBeenCalledWith('ProjA::P01', 'NewPass1!');
    });
  });

  // ------------------------------------------------------------------
  // Import button state & actions
  // ------------------------------------------------------------------
  describe('import button', () => {
    it('is disabled without a password entered', () => {
      render(<ImportFromRedcapModal {...defaultProps} candidates={[candidate()]} />);
      expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    });

    it('is disabled when the row password is empty or whitespace', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': '   ' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
    });

    it('is enabled once a password is provided', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': 'Secret1!' }}
        />
      );
      expect(screen.getByRole('button', { name: 'Import' })).not.toBeDisabled();
    });

    it('calls onImportOne with the candidate when clicked', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': 'Secret1!' }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Import' }));
      expect(defaultProps.onImportOne).toHaveBeenCalledWith(candidate());
    });

    it('shows "Imported" and disables the button for already-imported rows', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': 'Secret1!' }}
          importedKeys={{ 'ProjA::P01': true }}
        />
      );
      const btn = screen.getByRole('button', { name: 'Imported' });
      expect(btn).toBeDisabled();
    });

    it('shows "Importing..." and disables the row password field while importing', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          rowPasswords={{ 'ProjA::P01': 'Secret1!' }}
          importingKey="ProjA::P01"
        />
      );
      expect(screen.getByRole('button', { name: 'Importing...' })).toBeDisabled();
      expect(screen.getByPlaceholderText('TempPass123!')).toBeDisabled();
    });

    it('disables the row password field for already-imported rows', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          importedKeys={{ 'ProjA::P01': true }}
        />
      );
      expect(screen.getByPlaceholderText('TempPass123!')).toBeDisabled();
    });
  });

  // ------------------------------------------------------------------
  // Modal-level actions & importing lockout
  // ------------------------------------------------------------------
  describe('modal-level actions', () => {
    it('calls onRefresh when Refresh list is clicked', () => {
      render(<ImportFromRedcapModal {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refresh list' }));
      expect(defaultProps.onRefresh).toHaveBeenCalled();
    });

    it('disables Refresh list while loading', () => {
      render(<ImportFromRedcapModal {...defaultProps} loading={true} />);
      expect(screen.getByRole('button', { name: 'Refresh list' })).toBeDisabled();
    });

    it('calls onHide when the footer Close button is clicked', () => {
      render(<ImportFromRedcapModal {...defaultProps} />);
      // Bootstrap's header dismiss button also has aria-label "Close"; the footer one is last.
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      fireEvent.click(closeButtons[closeButtons.length - 1]);
      expect(defaultProps.onHide).toHaveBeenCalled();
    });

    it('disables Refresh list and the footer Close button while a row is importing', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          importingKey="ProjA::P01"
        />
      );
      expect(screen.getByRole('button', { name: 'Refresh list' })).toBeDisabled();
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      expect(closeButtons[closeButtons.length - 1]).toBeDisabled();
    });

    it('hides the header close button while a row is importing', () => {
      render(
        <ImportFromRedcapModal
          {...defaultProps}
          candidates={[candidate()]}
          importingKey="ProjA::P01"
        />
      );
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
    });
  });
});
