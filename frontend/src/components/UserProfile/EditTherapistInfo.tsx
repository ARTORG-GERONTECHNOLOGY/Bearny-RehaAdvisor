// src/components/UserProfile/EditTherapistInfo.tsx
import React, { useMemo, useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';
import config from '../../config/config.json';
import { observer } from 'mobx-react-lite';

import userProfileStore from '../../stores/userProfileStore';
import { UserType } from '../../types';

interface Props {
  userData: UserType;
  onCancel: () => void;
}

const EditUserInfo: React.FC<Props> = observer(({ userData, onCancel }) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<Record<string, any>>({ ...userData });
  const [error, setError] = useState<string>('');

  const saving = userProfileStore.saving;

  const fields = useMemo(() => {
    // keep your existing schema logic, just cached
    return (config as any).TherapistForm
      .flatMap((section: any) => section.fields)
      .filter(
        (field: any) =>
          ![
            'password',
            'repeatPassword',
            'oldPassword',
            'newPassword',
            'confirmPassword',
            'userType',
            'User Type:',
          ].includes(field.be_name)
      );
  }, []);

  const handleChange = (
    e:
      | React.ChangeEvent<HTMLInputElement>
      | React.ChangeEvent<HTMLSelectElement>
      | React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    field: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: selectedOptions?.map((o) => o.value) || [],
    }));
  };

  const validateProfile = (): boolean => {
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t('Invalid email format.'));
      return false;
    }

    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone)) {
      setError(t('Invalid phone number format.'));
      return false;
    }

    setError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateProfile()) return;

    try {
      await userProfileStore.updateProfile(formData as any);
      // store will switch mode to view; page will re-render
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('Update failed'));
    }
  };

  return (
    <Form onSubmit={handleSubmit} aria-label={t('Edit Profile Form')}>
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {fields.map((field: any) => (
        <Form.Group className="mb-3" key={field.be_name}>
          <Form.Label htmlFor={field.be_name}>{t(field.label)}</Form.Label>

          {field.type === 'multi-select' ? (
            <Select
              id={field.be_name}
              inputId={field.be_name}
              isMulti
              isDisabled={saving}
              options={(field.options || []).map((opt: string) => ({
                value: opt,
                label: t(opt),
              }))}
              value={(formData[field.be_name] || []).map((val: string) => ({
                value: val,
                label: t(val),
              }))}
              onChange={(selected) => handleMultiSelectChange(selected as any, field.be_name)}
            />
          ) : (
            <Form.Control
              type={field.type}
              id={field.be_name}
              value={formData[field.be_name] || ''}
              onChange={handleChange}
              disabled={saving || field.be_name === 'email'}
            />
          )}
        </Form.Group>
      ))}

      <div className="d-flex justify-content-between mt-4">
        <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
          {t('Cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('Saving...') : t('Save Changes')}
        </Button>
      </div>
    </Form>
  );
});

export default EditUserInfo;
