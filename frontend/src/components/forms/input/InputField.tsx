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
      aria-required={required}
      aria-label={label}
      className="bg-zinc-100 shadow-none"
    />
  </Field>
);

export default InputField;
