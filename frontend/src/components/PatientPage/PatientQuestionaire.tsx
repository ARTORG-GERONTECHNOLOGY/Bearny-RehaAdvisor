// src/components/patient/PatientQuestionaire.tsx
import React, { useState } from 'react';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import apiClient from '@/api/client';
import config from '@/config/config.json';
import { PatientType } from '@/types/index';
import ErrorAlert from '../common/ErrorAlert';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';

interface PatientPopupProps {
  patient_id: PatientType;
  show: boolean;
  handleClose: () => void;
}

interface SelectOption {
  value: string;
  label: string;
}

const CONTROL_HEIGHT = 44;
const TEXTAREA_MIN_HEIGHT = 120;

const PatientQuestionaire: React.FC<PatientPopupProps> = ({ patient_id, show, handleClose }) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string>('');

  // NEW: field-level backend errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [nonFieldErrors, setNonFieldErrors] = useState<string[]>([]);
  const [details, setDetails] = useState<string | null>(null);

  const selectStyles = {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: CONTROL_HEIGHT,
      height: CONTROL_HEIGHT,
      boxShadow: state.isFocused ? '0 0 0 0.2rem rgba(13,110,253,.25)' : base.boxShadow,
      borderColor: state.isFocused ? '#86b7fe' : base.borderColor,
    }),
    valueContainer: (base: any) => ({
      ...base,
      height: CONTROL_HEIGHT,
      padding: '0 8px',
      display: 'flex',
      alignItems: 'center',
    }),
    input: (base: any) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    indicatorsContainer: (base: any) => ({
      ...base,
      height: CONTROL_HEIGHT,
    }),
    // Radix Dialog sets pointerEvents:'none' on body; re-enable for react-select's portalled menu.
    menuPortal: (base: any) => ({ ...base, zIndex: 9999, pointerEvents: 'auto' }),
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;

    setFieldErrors((prev) => ({ ...prev, [id]: [] })); // clear field error
    setFormData({ ...formData, [id]: value });
  };

  const handleMultiSelectChange = (
    selectedOptions: readonly SelectOption[] | null,
    fieldName: string
  ) => {
    setFieldErrors((prev) => ({ ...prev, [fieldName]: [] }));
    const selectedValues = selectedOptions?.map((o) => o.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: selectedValues }));
  };

  const handleSave = async () => {
    setError('');
    setFieldErrors({});
    setNonFieldErrors([]);
    setDetails(null);

    try {
      const res = await apiClient.post(`/users/${patient_id}/initial-questionaire/`, formData);

      if (res.data?.success) {
        handleClose();
        return;
      }

      // Backend responded with error (success=false)
      setError(res.data.message || t('Failed to submit questionnaire.'));
      setFieldErrors(res.data.field_errors || {});
      setNonFieldErrors(res.data.non_field_errors || []);
      setDetails(res.data.details || null);
    } catch (err: any) {
      const backend = err?.response?.data;

      setError(
        backend?.message || backend?.error || err?.message || t('An unexpected error occurred.')
      );

      setFieldErrors(backend?.field_errors || {});
      setNonFieldErrors(backend?.non_field_errors || []);
      setDetails(backend?.details || null);
    }
  };

  const renderField = (field: any) => {
    const fieldValue = formData[field.be_name] || '';
    const errors = fieldErrors[field.be_name];

    const commonProps = {
      name: field.be_name,
      id: field.be_name,
      value: fieldValue,
      onChange: handleChange,
      required: field.required,
      'aria-label': t(field.label),
      className: errors?.length ? 'is-invalid' : '',
    };

    if (field.type === 'multi-select') {
      const options = field.options?.map((opt: string) => ({ value: opt, label: t(opt) })) || [];

      return (
        <>
          <Select
            id={field.be_name}
            isMulti
            options={options}
            placeholder={t('Select options')}
            value={(fieldValue || []).map((val: string) => ({ value: val, label: t(val) }))}
            onChange={(selected) => handleMultiSelectChange(selected, field.be_name)}
            styles={selectStyles as any}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
            className={errors?.length ? 'is-invalid' : ''}
          />
          {errors?.length > 0 && <div className="invalid-feedback d-block">{errors.join(' ')}</div>}
        </>
      );
    }

    if (field.type === 'dropdown') {
      return (
        <>
          <UiSelect
            value={fieldValue || undefined}
            onValueChange={(value) =>
              handleChange({
                target: { id: field.be_name, value },
              } as unknown as React.ChangeEvent<HTMLSelectElement>)
            }
            required={field.required}
            name={field.be_name}
          >
            <SelectTrigger
              id={field.be_name}
              aria-label={t(field.label)}
              aria-invalid={!!errors?.length}
              style={{ height: CONTROL_HEIGHT }}
            >
              <SelectValue placeholder={t('Select an option')} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt: string) => (
                <SelectItem key={opt} value={opt}>
                  {t(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </UiSelect>
          {errors?.length > 0 && <div className="invalid-feedback d-block">{errors.join(' ')}</div>}
        </>
      );
    }

    if (field.type === 'date') {
      return (
        <>
          <Input type="date" {...commonProps} style={{ height: CONTROL_HEIGHT }} />
          {errors?.length > 0 && <div className="invalid-feedback d-block">{errors.join(' ')}</div>}
        </>
      );
    }

    if (field.type === 'textarea' || field.type === 'text-long') {
      return (
        <>
          <Textarea
            placeholder={t(field.placeholder || '')}
            {...commonProps}
            style={{ minHeight: TEXTAREA_MIN_HEIGHT, resize: 'vertical' }}
          />
          {errors?.length > 0 && <div className="invalid-feedback d-block">{errors.join(' ')}</div>}
        </>
      );
    }

    return (
      <>
        <Input
          type={field.type || 'text'}
          placeholder={t(field.placeholder || '')}
          {...commonProps}
          style={{ height: CONTROL_HEIGHT }}
        />
        {errors?.length > 0 && <div className="invalid-feedback d-block">{errors.join(' ')}</div>}
      </>
    );
  };

  if (!patient_id) {
    return (
      <div className="text-center my-4">
        <Spinner />
        <p className="mt-3">{t('Loading')}...</p>
      </div>
    );
  }

  return (
    <Sheet open={show} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <SheetContent
        side="bottom"
        className="flex flex-col max-h-[90vh]"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{t('Initial Questionnaire')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {/* TOP ERROR BANNER */}
          {error && (
            <ErrorAlert message={error} onClose={() => setError('')}>
              {nonFieldErrors.length > 0 && (
                <ul className="mt-2 mb-0">
                  {nonFieldErrors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}

              {details && <pre className="bg-light p-2 mt-2 small border rounded">{details}</pre>}
            </ErrorAlert>
          )}

          {config.PatientInitialQuestionaire.map((section, idx) => (
            <Card key={idx} className="mb-4">
              <CardContent className="p-3">
                <h5 className="mb-3">{t(section.title)}</h5>

                {section.fields
                  .filter((f: any) => !['password', 'repeatPassword'].includes(f.type))
                  .map((field: any, fieldIdx: number) => (
                    <div
                      key={field.be_name || `${field.label}-${fieldIdx}`}
                      className="pq-field mb-3"
                    >
                      <Field>
                        <FieldLabel htmlFor={field.be_name}>{t(field.label)}</FieldLabel>
                        {renderField(field)}
                        {field.help && <FieldDescription>{t(field.help)}</FieldDescription>}
                      </Field>
                    </div>
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <SheetFooter>
          <Button onClick={handleSave}>{t('Submit')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default PatientQuestionaire;
