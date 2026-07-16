import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CopyTemplateSheet from '@/components/TherapistInterventionPage/CopyTemplateSheet';

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

function baseProps() {
  return {
    open: true,
    onOpenChange: jest.fn(),
    name: '',
    description: '',
    submitting: false,
    onNameChange: jest.fn(),
    onDescriptionChange: jest.fn(),
    onSubmit: jest.fn(),
  };
}

describe('CopyTemplateSheet', () => {
  it('renders nothing when closed', () => {
    render(<CopyTemplateSheet {...baseProps()} open={false} />);
    expect(screen.queryByText('Copy template')).not.toBeInTheDocument();
  });

  it('renders title and fields when open', () => {
    render(<CopyTemplateSheet {...baseProps()} />);
    expect(screen.getByText('Copy template')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Template name')).toBeInTheDocument();
  });

  it('calls onDescriptionChange when typing a description', () => {
    const props = baseProps();
    render(<CopyTemplateSheet {...props} />);
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'A copy' },
    });
    expect(props.onDescriptionChange).toHaveBeenCalledWith('A copy');
  });

  it('calls onOpenChange(false) when Cancel is clicked', () => {
    const props = baseProps();
    render(<CopyTemplateSheet {...props} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('disables Copy when name is blank', () => {
    render(<CopyTemplateSheet {...baseProps()} name="" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('calls onSubmit when Copy is clicked with a name', () => {
    const props = baseProps();
    render(<CopyTemplateSheet {...props} name="Copy of X" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows the submitting label and disables both buttons while submitting', () => {
    render(<CopyTemplateSheet {...baseProps()} name="Copy of X" submitting />);
    expect(screen.getByRole('button', { name: 'Copying...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });
});
