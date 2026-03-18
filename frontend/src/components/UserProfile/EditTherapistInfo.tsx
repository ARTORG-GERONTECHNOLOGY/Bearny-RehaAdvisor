// src/components/UserProfile/EditTherapistInfo.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Form, Modal } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import ErrorAlert from '../common/ErrorAlert';
import config from '../../config/config.json';
import { observer } from 'mobx-react-lite';

import apiClient from '../../api/client';
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

  // --- Access change request modal ---
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [reqClinics, setReqClinics] = useState<string[]>([]);
  const [reqProjects, setReqProjects] = useState<string[]>([]);
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');

  // Track whether there is already a pending request
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    apiClient
      .get('therapist/access-change-request/')
      .then((res: any) => setHasPending(Boolean(res?.data?.hasPending)))
      .catch(() => {});
  }, []);

  const saving = userProfileStore.saving;

  const fields = useMemo(() => {
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
          // clinic and projects are handled separately via the request flow
          'clinic',
          'projects',
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
    const values = selectedOptions?.map((o) => o.value) || [];
    setFormData((prev) => ({ ...prev, [field]: values }));
  };

  const resolveOptions = (field: any): string[] => {
    if (field.be_name === 'specialisation') return allSpecializations;
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
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || t('Update failed'));
    }
  };

  // --- Access request modal helpers ---
  const allowedProjectsForReq = useMemo(() => {
    if (!reqClinics.length) return allProjects;
    const set = new Set<string>();
    reqClinics.forEach((c) => (clinicProjectsMap[c] || []).forEach((p) => set.add(p)));
    return allProjects.filter((p) => set.has(p));
  }, [reqClinics]);

  const openAccessModal = () => {
    const currentClinics: string[] = Array.isArray(userData.clinics) ? userData.clinics : [];
    const currentProjects: string[] = Array.isArray(userData.projects) ? userData.projects : [];
    setReqClinics(currentClinics);
    setReqProjects(currentProjects.filter((p) => allowedProjectsForReq.includes(p)));
    setReqError('');
    setReqSuccess('');
    setShowAccessModal(true);
  };

  const handleReqClinicsChange = (selected: { value: string; label: string }[] | null) => {
    const clinics = selected?.map((o) => o.value) || [];
    setReqClinics(clinics);
    // prune projects no longer valid
    const allowed = new Set<string>();
    clinics.forEach((c) => (clinicProjectsMap[c] || []).forEach((p) => allowed.add(p)));
    setReqProjects((prev) => prev.filter((p) => allowed.has(p)));
  };

  const handleReqProjectsChange = (selected: { value: string; label: string }[] | null) => {
    setReqProjects(selected?.map((o) => o.value) || []);
  };

  const submitAccessRequest = async () => {
    setReqError('');
    setReqSubmitting(true);
    try {
      await apiClient.post('therapist/access-change-request/', {
        clinics: reqClinics,
        projects: reqProjects,
      });
      setReqSuccess(
        t(
          'Your request has been submitted. An admin will review it and you will be notified by e-mail.'
        )
      );
      setHasPending(true);
    } catch (err: any) {
      setReqError(err?.response?.data?.error || err?.message || t('Failed to submit request.'));
    } finally {
      setReqSubmitting(false);
    }
  };

  const currentClinics: string[] = Array.isArray(userData.clinics) ? userData.clinics : [];
  const currentProjects: string[] = Array.isArray(userData.projects) ? userData.projects : [];

  return (
    <>
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
                  (val: string) => ({ value: val, label: t(val) })
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

        {/* ── Clinic / Project: read-only display + request-change button ── */}
        <div className="border rounded p-3 mb-3 bg-light">
          <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <div className="mb-2">
                <span className="fw-semibold small text-muted">{t('Clinics')}</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {currentClinics.length ? (
                    currentClinics.map((c) => (
                      <Badge key={c} bg="info">
                        {c}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted small">—</span>
                  )}
                </div>
              </div>
              <div>
                <span className="fw-semibold small text-muted">{t('Projects')}</span>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {currentProjects.length ? (
                    currentProjects.map((p) => (
                      <Badge key={p} bg="secondary">
                        {p}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-muted small">—</span>
                  )}
                </div>
              </div>
            </div>

            <div className="d-flex flex-column align-items-end gap-1">
              <Button
                size="sm"
                variant="outline-primary"
                onClick={openAccessModal}
                disabled={saving}
              >
                {t('Request access change')}
              </Button>
              {hasPending && (
                <span className="badge bg-warning text-dark small">
                  {t('Change request pending admin approval')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="d-flex justify-content-between mt-4">
          <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? t('Saving...') : t('Save Changes')}
          </Button>
        </div>
      </Form>

      {/* ── Access change request modal ── */}
      <Modal
        show={showAccessModal}
        onHide={() => setShowAccessModal(false)}
        centered
        backdrop="static"
        size="lg"
      >
        <Modal.Header closeButton={!reqSubmitting}>
          <Modal.Title>{t('Request clinic / project change')}</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {reqSuccess ? (
            <Alert variant="success">{reqSuccess}</Alert>
          ) : (
            <>
              <Alert variant="info" className="small mb-3">
                {t(
                  'Changes to your clinic and project access require admin approval. Your current access will remain unchanged until the request is reviewed. You will be notified by e-mail.'
                )}
              </Alert>

              {reqError && (
                <Alert variant="danger" dismissible onClose={() => setReqError('')}>
                  {reqError}
                </Alert>
              )}

              <Form.Group className="mb-3">
                <Form.Label>{t('Requested clinics')}</Form.Label>
                <Select
                  isMulti
                  isDisabled={reqSubmitting}
                  options={allClinics.map((c) => ({ value: c, label: c }))}
                  value={reqClinics.map((c) => ({ value: c, label: c }))}
                  onChange={handleReqClinicsChange as any}
                />
              </Form.Group>

              <Form.Group>
                <Form.Label>{t('Requested projects')}</Form.Label>
                <Select
                  isMulti
                  isDisabled={reqSubmitting}
                  options={allowedProjectsForReq.map((p) => ({ value: p, label: p }))}
                  value={reqProjects.map((p) => ({ value: p, label: p }))}
                  onChange={handleReqProjectsChange as any}
                  placeholder={
                    reqClinics.length
                      ? t('Choose...')
                      : t('Select clinics first to see available projects')
                  }
                />
                {reqClinics.length > 0 && (
                  <Form.Text className="text-muted">
                    {t('Projects shown are those available for your selected clinics.')}
                  </Form.Text>
                )}
              </Form.Group>
            </>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowAccessModal(false)}
            disabled={reqSubmitting}
          >
            {reqSuccess ? t('Close') : t('Cancel')}
          </Button>
          {!reqSuccess && (
            <Button
              variant="primary"
              onClick={submitAccessRequest}
              disabled={reqSubmitting || (!reqClinics.length && !reqProjects.length)}
            >
              {reqSubmitting ? t('Submitting...') : t('Submit request')}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
});

export default EditUserInfo;
