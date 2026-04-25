import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Eye, EyeOffIcon } from 'lucide-react';
import React from 'react';

type PasswordFieldProps = {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  label: React.ReactNode;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
};

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  value,
  onChange,
  required = false,
  label,
  placeholder,
  autoComplete = 'current-password',
  disabled = false,
}) => {
  const [showPassword, setShowPassword] = React.useState(false);

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="bg-zinc-100">
        <InputGroupInput
          id={id}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-label={typeof label === 'string' ? label : undefined}
          aria-required={required}
        />
        <InputGroupAddon
          align="inline-end"
          onClick={() => setShowPassword((s) => !s)}
          className="cursor-pointer"
        >
          {showPassword ? <EyeOffIcon /> : <Eye />}
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
};

export default PasswordField;
