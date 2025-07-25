import React, { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import config from '../../config/config.json';
import ErrorAlert from '../common/ErrorAlert';


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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const handleMultiSelectChange = (
    selectedOptions: { value: string; label: string }[] | null,
    fieldName: string
  ) => {
    const values = selectedOptions?.map((opt) => opt.value) || [];
    setFormData((prev) => ({ ...prev, [fieldName]: values }));
  };

  const validateInputs = (): boolean => {
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError(t('Invalid email format.'));
      return false;
    }
    if (formData.phone && !/^\+?[0-9]{7,15}$/.test(formData.phone)) {
      setError(t('Invalid phone number format.'));
      return false;
    }
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setError(t('New passwords do not match!'));
      return false;
    }
    setError('');
    return true;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateInputs()) return;
    onSave(formData);
  };

  return (
    <Form onSubmit={handleSubmit} aria-label={t('Edit Profile Form')}>
      {error && <ErrorAlert message={error} onClose={() => setError('')} />}
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
            <Form.Label htmlFor={field.be_name}>{t(field.label)}</Form.Label>
            {field.type === 'multi-select' ? (
              <Select
                id={field.be_name}
                inputId={field.be_name}
                isMulti
                options={field.options.map((opt: string) => ({
                  value: opt,
                  label: t(opt),
                }))}
                value={
                  (formData[field.be_name] || []).map((val: string) => ({
                    value: val,
                    label: t(val),
                  })) || []
                }
                onChange={(selectedOptions) =>
                  handleMultiSelectChange(selectedOptions, field.be_name)
                }
                classNamePrefix="react-select"
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

      {/* Password fields */}
      <Form.Group className="mb-3" controlId="oldPassword">
        <Form.Label>{t('Old Password')}</Form.Label>
        <Form.Control
          type="password"
          value={formData.oldPassword}
          onChange={handleChange}
          aria-required="false"
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="newPassword">
        <Form.Label>{t('New Password')}</Form.Label>
        <Form.Control
          type="password"
          value={formData.newPassword}
          onChange={handleChange}
          aria-required="false"
        />
      </Form.Group>

      <Form.Group className="mb-3" controlId="confirmPassword">
        <Form.Label>{t('Confirm New Password')}</Form.Label>
        <Form.Control
          type="password"
          value={formData.confirmPassword}
          onChange={handleChange}
          aria-required="false"
        />
      </Form.Group>

      <div className="d-flex justify-content-between">
        <Button variant="secondary" type="button" onClick={onCancel} aria-label={t('Cancel')}>
          {t('Cancel')}
        </Button>
        <Button type="submit" variant="primary" aria-label={t('Save Changes')}>
          {t('Save Changes')}
        </Button>
      </div>
    </Form>
  );
};

export default EditUserInfo;
