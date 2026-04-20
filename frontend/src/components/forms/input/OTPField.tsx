import { Field, FieldLabel } from '@/components/ui/field';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import React from 'react';

type OTPFieldProps = {
  id: string;
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  required?: boolean;
};

const OTPField: React.FC<OTPFieldProps> = ({
  id,
  label,
  value,
  onChange,
  length = 6,
  required = false,
}) => (
  <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <InputOTP
      id={id}
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
      onChange={onChange}
      required={required}
      autoComplete="one-time-code"
    >
      <InputOTPGroup>
        {Array.from({ length }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="bg-zinc-100 shadow-none border border-input" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  </Field>
);

export default OTPField;
