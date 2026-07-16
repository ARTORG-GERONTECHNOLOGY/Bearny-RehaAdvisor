import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewTemplateSheet from '@/components/TherapistInterventionPage/NewTemplateSheet';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock('@/components/ui/sheet', () => {
  const React = jest.requireActual('react');
  return {
    Sheet: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    SheetFooter: ({ children }: { children: React.ReactNode }) =>
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
    name: '',
    description: '',
    isPublic: false,
    submitting: false,
    onNameChange: jest.fn(),
    onDescriptionChange: jest.fn(),
    onPublicChange: jest.fn(),
    onSubmit: jest.fn(),
  };
}

describe('NewTemplateSheet', () => {
  it('renders nothing when closed', () => {
    render(<NewTemplateSheet {...baseProps()} open={false} />);
    expect(screen.queryByText('Create new template')).not.toBeInTheDocument();
  });

  it('renders title and fields when open', () => {
    render(<NewTemplateSheet {...baseProps()} />);
    expect(screen.getByText('Create new template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Template name')).toBeInTheDocument();
  });

  it('calls onNameChange when typing a name', () => {
    const props = baseProps();
    render(<NewTemplateSheet {...props} />);
    fireEvent.change(screen.getByPlaceholderText('Template name'), {
      target: { value: 'My template' },
    });
    expect(props.onNameChange).toHaveBeenCalledWith('My template');
  });

  it('calls onPublicChange when the switch is toggled', () => {
    const props = baseProps();
    render(<NewTemplateSheet {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Public (visible to all therapists)' }));
    expect(props.onPublicChange).toHaveBeenCalledWith(true);
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const props = baseProps();
    render(<NewTemplateSheet {...props} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Create when name is blank', () => {
    render(<NewTemplateSheet {...baseProps()} name="" />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  it('calls onSubmit when Create is clicked with a name', () => {
    const props = baseProps();
    render(<NewTemplateSheet {...props} name="My template" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the submitting label and disables both buttons while submitting', () => {
    render(<NewTemplateSheet {...baseProps()} name="My template" submitting />);
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
