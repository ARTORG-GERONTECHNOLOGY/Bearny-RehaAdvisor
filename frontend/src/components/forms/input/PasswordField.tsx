import React from 'react';
import { Form, Button, InputGroup } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

type PasswordFieldProps = {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showPassword: boolean;
  onToggle: () => void;
  pagetype?: 'regular' | 'patient' | string;
  required?: boolean;
  label?: React.ReactNode;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
};

const PasswordField: React.FC<PasswordFieldProps> = ({
  id,
  value,
  onChange,
  showPassword,
  onToggle,
  pagetype = 'regular',
  required = false,
  label,
  placeholder,
  autoComplete,
  className,
}) => {
  const { t } = useTranslation();

  const resolvedLabel =
    label ?? (pagetype === 'patient' ? t('Patient Password') : t('Password'));

  const resolvedPlaceholder =
    placeholder ??
    (pagetype === 'patient' ? t('Enter patient password') : t('Enter your password'));

  const resolvedAutocomplete =
    autoComplete ??
    (id.toLowerCase().includes('new') ? 'new-password' : 'current-password');

  return (
    <Form.Group className={`mb-3 ${className || ''}`} controlId={id}>
      <Form.Label>{resolvedLabel}</Form.Label>
      <InputGroup>
        <Form.Control
          type={showPassword ? 'text' : 'password'}
          id={id}
          value={value}
          onChange={onChange}
          placeholder={resolvedPlaceholder}
          autoComplete={resolvedAutocomplete}
          required={required}
          aria-required={required ? 'true' : 'false'}
          aria-label={typeof resolvedLabel === 'string' ? resolvedLabel : undefined}
        />
        <Button
          variant="outline-secondary"
          type="button"
          onClick={onToggle}
          aria-label={showPassword ? t('Hide password') : t('Show password')}
          title={showPassword ? t('Hide password') : t('Show password')}
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </Button>
      </InputGroup>
    </Form.Group>
  );
};

export default PasswordField;
