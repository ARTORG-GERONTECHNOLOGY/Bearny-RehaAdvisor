import React, { useState } from 'react';
import { Form, Button, InputGroup } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import config from '../../config/config.json';
import ErrorAlert from '../common/ErrorAlert';
import apiClient from '../../api/client';
import authStore from '../../stores/authStore';
import { FaEye, FaEyeSlash } from 'react-icons/fa';

interface Props {
  userData: Record<string, any>;
  onSave: (data: Record<string, any>) => void; 
  onCancel: () => void;
}

const EditUserInfo: React.FC<Props> = ({ userData, onSave, onCancel }) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    ...userData,
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [error, setError] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false,
  });

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

  /* ------------------------------------------
     VALIDATION
     ------------------------------------------ */
  const validateInputs = (): boolean => {
    // Email
    if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)
    ) {
      setError(t('Invalid email format.'));
      return false;
    }

    // Phone
    if (
      formData.phone &&
      !/^\+?[0-9]{7,15}$/.test(formData.phone)
    ) {
      setError(t('Invalid phone number format.'));
      return false;
    }

    const isChangingPassword =
      formData.oldPassword || formData.newPassword || formData.confirmPassword;

    if (isChangingPassword) {
      // Old password required
      if (!formData.oldPassword) {
        setError(t('Please enter your old password.'));
        return false;
      }

      // New password required
      if (!formData.newPassword) {
        setError(t('Please enter a new password.'));
        return false;
      }

      // Length check
      if (formData.newPassword.length < 8) {
        setError(t('New password must be at least 8 characters.'));
        return false;
      }

      // Confirmation match
      if (formData.newPassword !== formData.confirmPassword) {
        setError(t('New passwords do not match!'));
        return false;
      }
    }

    setError('');
    return true;
  };

  /* ------------------------------------------
     SUBMIT
     ------------------------------------------ */
  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!validateInputs()) return;

  setSaving(true);
  setError("");

  const isChangingPassword =
    formData.oldPassword && formData.newPassword;

  // 1) Prepare payload without password fields
  const payload = { ...formData };
  delete payload.oldPassword;
  delete payload.newPassword;
  delete payload.confirmPassword;

  // Clear password fields BEFORE sending put/profile
  setFormData((prev) => ({
    ...prev,
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  }));

  try {
    // First update profile
    await onSave(payload);

    // Then update password if needed
    if (isChangingPassword) {
      await apiClient.put(`/users/${authStore.id}/change-password/`, {
        old_password: formData.oldPassword,
        new_password: formData.newPassword,
      });
    }
  } catch (err) {
    setError(err?.response?.data?.error || t("Update failed"));
  } finally {
    setSaving(false);
  }
};


  return (
    <Form onSubmit={handleSubmit} aria-label={t('Edit Profile Form')}>
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}

      {/* -------------------- USER FIELDS -------------------- */}
      {config.TherapistForm.flatMap((section) => section.fields)
        .filter((field) =>
          ![
            'password',
            'repeatPassword',
            'oldPassword',
            'newPassword',
            'confirmPassword',
            'userType',
            'User Type:',
          ].includes(field.be_name)
        )
        .map((field) => (
          <Form.Group className="mb-3" key={field.be_name}>
            <Form.Label htmlFor={field.be_name}>
              {t(field.label)}
            </Form.Label>

            {field.type === 'multi-select' ? (
              <Select
                id={field.be_name}
                inputId={field.be_name}
                isMulti
                options={field.options.map((opt: string) => ({
                  value: opt,
                  label: t(opt),
                }))}
                value={(formData[field.be_name] || []).map(
                  (val: string) => ({
                    value: val,
                    label: t(val),
                  })
                )}
                onChange={(selected) =>
                  handleMultiSelectChange(selected, field.be_name)
                }
              />
            ) : (
              <Form.Control
                type={field.type}
                id={field.be_name}
                value={formData[field.be_name] || ''}
                onChange={handleChange}
                disabled={field.be_name === 'email'}
              />
            )}
          </Form.Group>
        ))}

      {/* -------------------- PASSWORD FIELDS -------------------- */}

      {/* Old Password */}
      <Form.Group className="mb-3" controlId="oldPassword">
        <Form.Label>{t('Old Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={showPassword.old ? 'text' : 'password'}
            value={formData.oldPassword}
            onChange={handleChange}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() =>
              setShowPassword((p) => ({ ...p, old: !p.old }))
            }
          >
            {showPassword.old ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      {/* New Password */}
      <Form.Group className="mb-3" controlId="newPassword">
        <Form.Label>{t('New Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={showPassword.new ? 'text' : 'password'}
            value={formData.newPassword}
            onChange={handleChange}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() =>
              setShowPassword((p) => ({ ...p, new: !p.new }))
            }
          >
            {showPassword.new ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      {/* Confirm Password */}
      <Form.Group className="mb-3" controlId="confirmPassword">
        <Form.Label>{t('Confirm New Password')}</Form.Label>
        <InputGroup>
          <Form.Control
            type={showPassword.confirm ? 'text' : 'password'}
            value={formData.confirmPassword}
            onChange={handleChange}
          />
          <Button
            variant="outline-secondary"
            type="button"
            onClick={() =>
              setShowPassword((p) => ({
                ...p,
                confirm: !p.confirm,
              }))
            }
          >
            {showPassword.confirm ? <FaEyeSlash /> : <FaEye />}
          </Button>
        </InputGroup>
      </Form.Group>

      {/* -------------------- ACTION BUTTONS -------------------- */}
      <div className="d-flex justify-content-between mt-4">
        <Button
          variant="secondary"
          type="button"
          onClick={onCancel}
        >
          {t('Cancel')}
        </Button>

        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? t('Saving...') : t('Save Changes')}
        </Button>
      </div>
    </Form>
  );
};

export default EditUserInfo;
