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

  describe('custom react-select styles', () => {
    const getStyles = () => {
      render(<MultiSelectField {...defaultProps} />);
      const selectMock = Select as unknown as jest.Mock;
      return selectMock.mock.calls[0][0].styles as Record<string, (provided: any, state?: any) => any>;
    };

    it('styles the control', () => {
      const styles = getStyles();
      const result = styles.control({ padding: 4 });
      expect(result).toEqual(
        expect.objectContaining({
          padding: 4,
          borderRadius: '6px',
          borderColor: '#dee2e6',
          boxShadow: 'none',
        })
      );
      expect(result['&:hover']).toEqual({ borderColor: '#dee2e6' });
    });

    it('styles a multi-value chip', () => {
      const styles = getStyles();
      const result = styles.multiValue({ margin: 2 });
      expect(result).toEqual(
        expect.objectContaining({
          margin: 2,
          backgroundColor: '#f4f4f5',
          borderRadius: '6px',
        })
      );
    });

    it('styles the menu', () => {
      const styles = getStyles();
      const result = styles.menu({ zIndex: 1 });
      expect(result).toEqual(
        expect.objectContaining({
          zIndex: 1,
          backgroundColor: '#fafafa',
          borderRadius: '24px',
        })
      );
    });

    it('styles a focused option differently from an unfocused one', () => {
      const styles = getStyles();
      const focused = styles.option({ padding: 8 }, { isFocused: true });
      const unfocused = styles.option({ padding: 8 }, { isFocused: false });

      expect(focused.backgroundColor).toBe('#f4f4f5');
      expect(unfocused.backgroundColor).toBe('transparent');
      expect(focused.color).toBe('#333');
      expect(focused.borderRadius).toBe('24px');
    });
  });
});
