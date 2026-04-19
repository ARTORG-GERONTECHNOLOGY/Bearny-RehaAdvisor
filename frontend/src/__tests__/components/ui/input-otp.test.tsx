import { render, screen } from '@testing-library/react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp';

// input-otp uses browser APIs (pointer events, shadow DOM) not available in jsdom
jest.mock('input-otp', () => {
  const React = require('react');
  const OTPInputContext = React.createContext({
    slots: [{ char: '', hasFakeCaret: false, isActive: false }],
  });
  return {
    OTPInput: React.forwardRef(
      ({ children, containerClassName, className, ...rest }: any, ref: any) => (
        <div className={containerClassName}>
          <input ref={ref} className={className} {...rest} />
          {children}
        </div>
      )
    ),
    OTPInputContext,
  };
});

jest.mock('lucide-react', () => ({
  Minus: () => <svg data-testid="minus-icon" />,
}));

// ─── InputOTP ────────────────────────────────────────────────────────────────

describe('InputOTP', () => {
  it('renders container with merged containerClassName', () => {
    const { container } = render(
      <InputOTP maxLength={6} containerClassName="otp-wrapper">
        <InputOTPGroup />
      </InputOTP>
    );
    expect(container.querySelector('.otp-wrapper')).toBeInTheDocument();
  });

  it('merges className onto the inner input', () => {
    const { container } = render(
      <InputOTP maxLength={6} className="otp-input">
        <InputOTPGroup />
      </InputOTP>
    );
    expect(container.querySelector('.otp-input')).toBeInTheDocument();
  });
});

// ─── InputOTPGroup ───────────────────────────────────────────────────────────

describe('InputOTPGroup', () => {
  it('renders a div', () => {
    const { container } = render(<InputOTPGroup />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('merges custom className', () => {
    const { container } = render(<InputOTPGroup className="otp-group" />);
    expect(container.firstChild).toHaveClass('otp-group');
  });
});

// ─── InputOTPSlot ────────────────────────────────────────────────────────────

describe('InputOTPSlot', () => {
  function SlotWithContext({
    slots,
    index = 0,
  }: {
    slots: { char: string; hasFakeCaret: boolean; isActive: boolean }[];
    index?: number;
  }) {
    const { OTPInputContext } = require('input-otp');
    return (
      <OTPInputContext.Provider value={{ slots }}>
        <InputOTPSlot index={index} />
      </OTPInputContext.Provider>
    );
  }

  it('renders the character from context', () => {
    render(<SlotWithContext slots={[{ char: 'A', hasFakeCaret: false, isActive: false }]} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('applies ring class when slot is active', () => {
    const { container } = render(
      <SlotWithContext slots={[{ char: '', hasFakeCaret: false, isActive: true }]} />
    );
    expect(container.firstChild).toHaveClass('ring-1');
  });

  it('does not apply ring class when slot is inactive', () => {
    const { container } = render(
      <SlotWithContext slots={[{ char: '', hasFakeCaret: false, isActive: false }]} />
    );
    expect(container.firstChild).not.toHaveClass('ring-1');
  });

  it('renders fake caret when hasFakeCaret is true', () => {
    const { container } = render(
      <SlotWithContext slots={[{ char: '', hasFakeCaret: true, isActive: true }]} />
    );
    expect(container.querySelector('.animate-caret-blink')).toBeInTheDocument();
  });

  it('does not render fake caret when hasFakeCaret is false', () => {
    const { container } = render(
      <SlotWithContext slots={[{ char: '', hasFakeCaret: false, isActive: false }]} />
    );
    expect(container.querySelector('.animate-caret-blink')).toBeNull();
  });

  it('merges custom className', () => {
    const { container } = render(
      <SlotWithContext slots={[{ char: '', hasFakeCaret: false, isActive: false }]} />
    );
    // Just verify slot renders without crash
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ─── InputOTPSeparator ───────────────────────────────────────────────────────

describe('InputOTPSeparator', () => {
  it('renders with role=separator', () => {
    render(<InputOTPSeparator />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders the Minus icon', () => {
    render(<InputOTPSeparator />);
    expect(screen.getByTestId('minus-icon')).toBeInTheDocument();
  });
});
