import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Select from 'react-select';
import MultiSelectField from '@/components/forms/input/MultiSelectField';

jest.mock('react-select', () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="mock-react-select" />),
}));

describe('MultiSelectField Component', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
  ];

  const value = [{ value: 'a', label: 'Option A' }];

  const defaultProps = {
    id: 'multi-id',
    label: 'Choose options',
    options,
    value,
    onChange: jest.fn(),
    placeholder: 'Select...',
    isDisabled: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders label and forwards base props to react-select', () => {
    render(<MultiSelectField {...defaultProps} />);

    expect(screen.getByText('Choose options')).toBeInTheDocument();
    expect(screen.getByTestId('mock-react-select')).toBeInTheDocument();

    const selectMock = Select as unknown as jest.Mock;
    expect(selectMock).toHaveBeenCalledTimes(1);

    const selectProps = selectMock.mock.calls[0][0] as {
      id: string;
      inputId: string;
      isMulti: boolean;
      isDisabled: boolean | undefined;
      options: typeof options;
      value: typeof value;
      placeholder: string | undefined;
      onChange: (selected: typeof value | null) => void;
    };

    expect(selectProps.id).toBe('multi-id');
    expect(selectProps.inputId).toBe('multi-id');
    expect(selectProps.isMulti).toBe(true);
    expect(selectProps.isDisabled).toBe(true);
    expect(selectProps.options).toEqual(options);
    expect(selectProps.value).toEqual(value);
    expect(selectProps.placeholder).toBe('Select...');
  });

  it('calls onChange with selected options', () => {
    render(<MultiSelectField {...defaultProps} />);

    const selectMock = Select as unknown as jest.Mock;
    const selectProps = selectMock.mock.calls[0][0] as {
      onChange: (selected: typeof value | null) => void;
    };

    const selected = [{ value: 'b', label: 'Option B' }];
    selectProps.onChange(selected);

    expect(defaultProps.onChange).toHaveBeenCalledWith(selected);
  });

  it('calls onChange with null when selection is cleared', () => {
    render(<MultiSelectField {...defaultProps} />);

    const selectMock = Select as unknown as jest.Mock;
    const selectProps = selectMock.mock.calls[0][0] as {
      onChange: (selected: typeof value | null) => void;
    };

    selectProps.onChange(null);

    expect(defaultProps.onChange).toHaveBeenCalledWith(null);
  });
});
