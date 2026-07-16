import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EditTemplateMetaSheet from '@/components/TherapistInterventionPage/EditTemplateMetaSheet';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/dialog', () => {
  const React = jest.requireActual('react');
  return {
    Dialog: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    DialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    DialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    DialogFooter: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
  };
});

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <button type="button" id={id} aria-pressed={checked} onClick={() => onCheckedChange(!checked)}>
      switch
    </button>
  ),
}));

function baseProps() {
  return {
    open: true,
    onOpenChange: jest.fn(),
    name: 'My template',
    description: '',
    isPublic: false,
    showPublicToggle: true,
    submitting: false,
    onNameChange: jest.fn(),
    onDescriptionChange: jest.fn(),
    onPublicChange: jest.fn(),
    onSubmit: jest.fn(),
  };
}

describe('EditTemplateMetaSheet', () => {
  it('renders nothing when closed', () => {
    render(<EditTemplateMetaSheet {...baseProps()} open={false} />);
    expect(screen.queryByText('Edit template info')).not.toBeInTheDocument();
  });

  it('renders title and fields when open', () => {
    render(<EditTemplateMetaSheet {...baseProps()} />);
    expect(screen.getByText('Edit template info')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Template name')).toHaveValue('My template');
  });

  it('shows the public toggle when showPublicToggle is true', () => {
    render(<EditTemplateMetaSheet {...baseProps()} />);
    expect(
      screen.getByRole('button', { name: 'Public (visible to all therapists)' })
    ).toBeInTheDocument();
  });

  it('hides the public toggle when showPublicToggle is false', () => {
    render(<EditTemplateMetaSheet {...baseProps()} showPublicToggle={false} />);
    expect(
      screen.queryByRole('button', { name: 'Public (visible to all therapists)' })
    ).not.toBeInTheDocument();
  });

  it('calls onPublicChange when the switch is toggled', () => {
    const props = baseProps();
    render(<EditTemplateMetaSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public (visible to all therapists)' }));
    expect(props.onPublicChange).toHaveBeenCalledWith(true);
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const props = baseProps();
    render(<EditTemplateMetaSheet {...props} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Save when name is blank', () => {
    render(<EditTemplateMetaSheet {...baseProps()} name="" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('calls onSubmit when Save is clicked with a name', () => {
    const props = baseProps();
    render(<EditTemplateMetaSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the submitting label and disables both buttons while submitting', () => {
    render(<EditTemplateMetaSheet {...baseProps()} submitting />);
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
