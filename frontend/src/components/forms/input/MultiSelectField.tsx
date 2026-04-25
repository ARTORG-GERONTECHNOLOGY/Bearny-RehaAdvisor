import React from 'react';
import Select from 'react-select';
import { Label } from '@/components/ui/label';

interface Option {
  value: string;
  label: string;
}

interface MultiSelectFieldProps {
  id: string;
  label: string;
  options: Option[];
  value: Option[];
  onChange: (selected: Option[] | null) => void;
  placeholder?: string;
  isDisabled?: boolean;
}

const MultiSelectField: React.FC<MultiSelectFieldProps> = ({
  id,
  label,
  options,
  value,
  onChange,
  placeholder,
  isDisabled,
}) => (
  <>
    <Label htmlFor={id}>{label}</Label>
    <Select
      id={id}
      inputId={id}
      isMulti
      isDisabled={isDisabled}
      options={options}
      value={value}
      onChange={(selected) => onChange(selected as Option[] | null)}
      placeholder={placeholder}
      styles={{
        control: (provided) => ({
          ...provided,
          borderRadius: '6px',
          borderColor: '#dee2e6',
          boxShadow: 'none',
          '&:hover': { borderColor: '#dee2e6' },
        }),
        multiValue: (provided) => ({
          ...provided,
          backgroundColor: '#f4f4f5',
          borderRadius: '6px',
        }),
        menu: (provided) => ({
          ...provided,
          backgroundColor: '#fafafa',
          borderRadius: '24px',
        }),
        option: (provided, state) => ({
          ...provided,
          backgroundColor: state.isFocused ? '#f4f4f5' : 'transparent',
          color: '#333',
          borderRadius: '24px',
        }),
      }}
    />
  </>
);

export default MultiSelectField;
