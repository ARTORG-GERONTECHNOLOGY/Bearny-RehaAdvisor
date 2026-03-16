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

const therapistInfo = (config as any).therapistInfo || {};
const allClinics: string[] = Object.keys(therapistInfo.clinic_projects || {});
const allProjects: string[] = therapistInfo.projects || [];
const allSpecializations: string[] = therapistInfo.specializations || [];
const clinicProjectsMap: Record<string, string[]> = therapistInfo.clinic_projects || {};

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
    return (config as any).TherapistForm.flatMap((section: any) => section.fields).filter(
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

  // Projects allowed based on currently selected clinics
  const allowedProjects = useMemo(() => {
    const selected: string[] = Array.isArray(formData.clinic) ? formData.clinic : [];
    if (!selected.length) return allProjects;
    const set = new Set<string>();
    selected.forEach((c) => (clinicProjectsMap[c] || []).forEach((p) => set.add(p)));
    return allProjects.filter((p) => set.has(p));
  }, [formData.clinic]);

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    field: string
  ) => {
    const values = selectedOptions?.map((o) => o.value) || [];
    setFormData((prev) => {
      const next: Record<string, any> = { ...prev, [field]: values };
      // When clinics change, prune any projects no longer allowed
      if (field === 'clinic') {
        const allowed = new Set<string>();
        values.forEach((c) => (clinicProjectsMap[c] || []).forEach((p) => allowed.add(p)));
        const currentProjects: string[] = Array.isArray(prev.projects) ? prev.projects : [];
        next.projects = currentProjects.filter((p) => allowed.has(p));
      }
      return next;
    });
  };

  // Resolve options for fields marked 'fromConfig'
  const resolveOptions = (field: any): string[] => {
    if (field.be_name === 'specialisation') return allSpecializations;
    if (field.be_name === 'clinic') return allClinics;
    if (field.be_name === 'projects') return allowedProjects;
    return Array.isArray(field.options) ? field.options : [];
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
              options={resolveOptions(field).map((opt: string) => ({
                value: opt,
                label: t(opt),
              }))}
              value={(Array.isArray(formData[field.be_name]) ? formData[field.be_name] : []).map(
                (val: string) => ({
                  value: val,
                  label: t(val),
                })
              )}
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
