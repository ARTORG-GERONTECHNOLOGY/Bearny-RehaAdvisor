import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

interface InputFieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  autoComplete?: string;
  disabled?: boolean;
}

const InputField: React.FC<InputFieldProps> = ({
  id,
  label,
  type,
  value,
  placeholder,
  onChange,
  required = true,
  autoComplete,
  disabled,
}) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input
      id={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      autoComplete={autoComplete}
      disabled={disabled}
      aria-required={required}
      aria-label={label}
      className="bg-zinc-100 shadow-none"
    />
  </Field>
);

export default InputField;
