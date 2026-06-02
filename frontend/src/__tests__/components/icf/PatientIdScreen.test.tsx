import { render, screen, fireEvent } from '@testing-library/react';
import PatientIdScreen from '@/components/icf/PatientIdScreen';

describe('PatientIdScreen', () => {
  const noop = () => {};

  it('renders Teilnehmer:in-ID heading and logo', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.getByRole('heading', { name: 'Teilnehmer:in-ID' })).toBeInTheDocument();
    expect(screen.getByAltText('Logo')).toBeInTheDocument();
  });

  it('does not render the old Patienten-ID heading', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.queryByRole('heading', { name: 'Patienten-ID' })).not.toBeInTheDocument();
  });

  it('does not render the format hint label', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.queryByText(/Format.*P001/i)).not.toBeInTheDocument();
  });

  it('renders the text input field', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('reflects the value prop in the input', () => {
    render(<PatientIdScreen value="P001-001T1" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.getByRole('textbox')).toHaveValue('P001-001T1');
  });

  it('calls onChange when the input value changes', () => {
    const onChange = jest.fn();
    render(<PatientIdScreen value="" error="" onChange={onChange} onSubmit={noop} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'P002-001T1' } });
    expect(onChange).toHaveBeenCalledWith('P002-001T1');
  });

  it('calls onSubmit when the Weiter button is clicked', () => {
    const onSubmit = jest.fn();
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit when Enter is pressed in the input', () => {
    const onSubmit = jest.fn();
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not call onSubmit on other key presses', () => {
    const onSubmit = jest.fn();
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Tab' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows error message when error prop is non-empty', () => {
    render(<PatientIdScreen value="" error="Ungültiges Format" onChange={noop} onSubmit={noop} />);
    expect(screen.getByText('Ungültiges Format')).toBeInTheDocument();
  });

  it('adds icf-input--error class on the input when error is set', () => {
    render(<PatientIdScreen value="" error="Ungültiges Format" onChange={noop} onSubmit={noop} />);
    expect(screen.getByRole('textbox')).toHaveClass('icf-input--error');
  });

  it('does not show error message when error prop is empty', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.queryByText(/Ungültiges Format/)).not.toBeInTheDocument();
  });

  it('does not add icf-input--error class when error is empty', () => {
    render(<PatientIdScreen value="" error="" onChange={noop} onSubmit={noop} />);
    expect(screen.getByRole('textbox')).not.toHaveClass('icf-input--error');
  });
});
