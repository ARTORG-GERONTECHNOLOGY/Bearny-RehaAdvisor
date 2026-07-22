import React, { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Select from 'react-select';
import { observer } from 'mobx-react-lite';

import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PatientPopupStore, toDateInput, toDisplayDate } from '@/stores/patientPopupStore';
import PatientInfoSourceBadge from './PatientInfoSourceBadge';

export type PatientFieldType =
  | 'text'
  | 'email'
  | 'date'
  | 'checkbox'
  | 'dropdown'
  | 'multi-select'
  | 'comma-list'
  | 'textarea';

export interface PatientFieldConfig {
  be_name: string;
  label: string;
  type?: PatientFieldType;
  options?: string[];
  maxLength?: number;
  rows?: number;
  placeholder?: string;
  /** System-computed value with no manual/REDCap source and no edit UI; hidden entirely while editing. */
  readOnly?: boolean;
  /** Only used by 'dropdown' — e.g. disable the project dropdown until a clinic is picked. */
  disabled?: boolean;
  /** Only used by 'dropdown' — side effect on change, e.g. resetting a dependent field. */
  onValueChange?: (value: string) => void;
}

export const createFieldChangeHandler =
  (store: PatientPopupStore) =>
  (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    store.setField(e.target.id, e.target.value);
  };

interface PatientInfoFieldRendererProps {
  store: PatientPopupStore;
  field: PatientFieldConfig;
}

const PatientInfoFieldRenderer: React.FC<PatientInfoFieldRendererProps> = observer(
  ({ store, field }) => {
    const { t } = useTranslation();
    const key = field.be_name;
    const manualValue = store.formData[key];
    const displayValue = store.getDisplayValue(key);
    const handleChange = createFieldChangeHandler(store);

    if (field.readOnly && store.isEditing) return null;

    if (!store.isEditing || key === 'access_word') {
      let display: string;
      if (field.type === 'multi-select') {
        display = ((displayValue || []) as string[]).map((v: string) => t(v)).join(', ') || '—';
      } else if (field.type === 'comma-list') {
        display = store.arrayToDisplay(displayValue) || '—';
      } else if (field.type === 'dropdown') {
        display = displayValue ? t(String(displayValue)) : '—';
      } else if (field.type === 'date') {
        display = toDisplayDate(displayValue) || '—';
      } else if (field.type === 'checkbox') {
        display = displayValue ? t('Yes') : t('No');
      } else {
        display = String(displayValue || '—');
      }
      return (
        <div>
          <div className="text-zinc-500 text-xs">
            {t(field.label)}{' '}
            {!field.readOnly && <PatientInfoSourceBadge store={store} fieldKey={key} />}
          </div>
          <div className="text-sm font-medium">{display}</div>
        </div>
      );
    }

    if (field.type === 'multi-select') {
      const currentValues: string[] = (manualValue || []) as any;
      const options =
        key === 'diagnosis' && store.formData.function?.length
          ? store.formData.function.flatMap((spec: string) =>
              (store.specialityDiagnosisMap[spec] || []).map((diag: string) => ({
                value: diag,
                label: t(diag),
              }))
            )
          : (field.options || []).map((opt: string) => ({ value: opt, label: t(opt) }));
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <Select
            inputId={key}
            isMulti
            options={options}
            value={(currentValues || []).map((val: string) => ({ value: val, label: t(val) }))}
            onChange={(selected) => store.setMultiSelect(key, selected as any)}
            aria-label={t(field.label)}
            placeholder={t('Select...')}
          />
        </Field>
      );
    }

    if (field.type === 'dropdown') {
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <UiSelect
            value={manualValue || undefined}
            onValueChange={(value) => {
              store.setField(key, value);
              field.onValueChange?.(value);
            }}
            disabled={field.disabled}
          >
            <SelectTrigger id={key} aria-label={t(field.label)}>
              <SelectValue
                placeholder={field.placeholder ? t(field.placeholder) : t('Select an option')}
              />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((opt: string) => (
                <SelectItem key={opt} value={opt}>
                  {t(opt)}
                </SelectItem>
              ))}
            </SelectContent>
          </UiSelect>
        </Field>
      );
    }

    if (field.type === 'date') {
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <Input
            id={key}
            type="date"
            value={toDateInput(manualValue)}
            onChange={handleChange}
            aria-label={t(field.label)}
          />
        </Field>
      );
    }

    if (field.type === 'checkbox') {
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <div>
            <Switch
              id={key}
              checked={!!manualValue}
              onCheckedChange={(checked) => store.setField(key, checked)}
              aria-label={t(field.label)}
            />
          </div>
        </Field>
      );
    }

    if (field.type === 'comma-list') {
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <Input
            id={key}
            type="text"
            value={store.arrayToDisplay(manualValue)}
            onChange={(e) => store.setCommaSeparated(key, e.target.value)}
            aria-label={t(field.label)}
            placeholder={field.placeholder ? t(field.placeholder) : undefined}
            maxLength={field.maxLength ?? 1000}
          />
        </Field>
      );
    }

    if (field.type === 'textarea') {
      return (
        <Field>
          <FieldLabel htmlFor={key}>
            {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
          </FieldLabel>
          <Textarea
            id={key}
            rows={field.rows ?? 3}
            value={manualValue || ''}
            onChange={handleChange}
            aria-label={t(field.label)}
            maxLength={field.maxLength ?? 2000}
          />
        </Field>
      );
    }

    const commonMaxLength =
      field.maxLength ?? (field.type === 'text' || !field.type ? 500 : undefined);
    return (
      <Field>
        <FieldLabel htmlFor={key}>
          {t(field.label)} <PatientInfoSourceBadge store={store} fieldKey={key} />
        </FieldLabel>
        <Input
          id={key}
          type={field.type || 'text'}
          value={manualValue || ''}
          onChange={handleChange}
          aria-label={t(field.label)}
          maxLength={commonMaxLength}
        />
      </Field>
    );
  }
);

export default PatientInfoFieldRenderer;
