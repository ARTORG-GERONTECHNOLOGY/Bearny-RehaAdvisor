import { render, screen, fireEvent } from '@testing-library/react';
import InputField from '@/components/forms/input/InputField';
import '@testing-library/jest-dom';

describe('InputField Component', () => {
  const defaultProps = {
    id: 'email',
    label: 'Email Address',
    type: 'email',
    value: 'test@example.com',
    placeholder: 'Enter your email',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders input field with correct label and props', () => {
    render(<InputField {...defaultProps} />);
    const input = screen.getByLabelText('Email Address');

    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAttribute('placeholder', 'Enter your email');
    expect(input).toHaveValue('test@example.com');
  });

  it('calls onChange when user types in the input', () => {
    render(<InputField {...defaultProps} />);
    const input = screen.getByLabelText('Email Address');
    fireEvent.change(input, { target: { value: 'new@example.com' } });

    expect(defaultProps.onChange).toHaveBeenCalledTimes(1);
  });
});
