import { render, screen } from '@testing-library/react';
import OTPField from '@/components/forms/input/OTPField';

// input-otp uses browser APIs not available in jsdom
jest.mock('input-otp', () => {
  const React = require('react');
  const OTPInputContext = React.createContext({
    slots: Array.from({ length: 6 }, () => ({ char: '', hasFakeCaret: false, isActive: false })),
  });
  return {
    OTPInput: React.forwardRef(
      ({ children, containerClassName, className, ...rest }: any, ref: any) => (
        <div className={containerClassName}>
          <input ref={ref} className={className} data-testid="otp-input" {...rest} />
          {children}
        </div>
      )
    ),
    OTPInputContext,
    REGEXP_ONLY_DIGITS: '^\\d+$',
  };
});

const baseProps = {
  id: 'otp',
  label: 'Verification Code',
  value: '',
  onChange: jest.fn(),
};

describe('OTPField', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the label', () => {
    render(<OTPField {...baseProps} />);
    expect(screen.getByText('Verification Code')).toBeInTheDocument();
  });

  it('renders the input field', () => {
    render(<OTPField {...baseProps} />);
    expect(screen.getByTestId('otp-input')).toBeInTheDocument();
  });

  it('passes value to the OTPInput', () => {
    render(<OTPField {...baseProps} value="123456" />);
    expect(screen.getByTestId('otp-input')).toHaveValue('123456');
  });

  it('sets maxLength to 6 by default', () => {
    render(<OTPField {...baseProps} />);
    expect(screen.getByTestId('otp-input')).toHaveAttribute('maxlength', '6');
  });

  it('accepts a custom length', () => {
    render(<OTPField {...baseProps} length={4} />);
    expect(screen.getByTestId('otp-input')).toHaveAttribute('maxlength', '4');
  });

  it('renders the correct number of OTPSlots for default length', () => {
    render(<OTPField {...baseProps} />);
    // Each slot renders as a div; count by data-driven: 6 slots for length=6
    const { container } = render(<OTPField {...baseProps} />);
    const slots = container.querySelectorAll('[class*="bg-zinc-100"]');
    expect(slots.length).toBe(6);
  });

  it('sets autoComplete to one-time-code', () => {
    render(<OTPField {...baseProps} />);
    expect(screen.getByTestId('otp-input')).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('marks the field as required when required prop is set', () => {
    render(<OTPField {...baseProps} required />);
    expect(screen.getByTestId('otp-input')).toBeRequired();
  });

  it('accepts a ReactNode as label', () => {
    render(<OTPField {...baseProps} label={<strong>Enter code</strong>} />);
    expect(screen.getByText('Enter code')).toBeInTheDocument();
  });
});
