// src/components/UserProfile/EditProfileSheet.tsx
import React, { useEffect, useMemo, useState } from 'react';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import ErrorAlert from '@/components/common/ErrorAlert';
import config from '@/config/config.json';
import apiClient from '@/api/client';
import userProfileStore from '@/stores/userProfileStore';
import { UserType } from '@/types';

const therapistInfo = (config as any).therapistInfo || {};
const allClinics: string[] = Object.keys(therapistInfo.clinic_projects || {});
const allProjects: string[] = therapistInfo.projects || [];
const allSpecializations: string[] = therapistInfo.specializations || [];
const clinicProjectsMap: Record<string, string[]> = therapistInfo.clinic_projects || {};

interface Props {
  show: boolean;
  userData: UserType;
  onCancel: () => void;
}

const EditProfileSheet: React.FC<Props> = observer(({ show, userData, onCancel }) => {
  const { t } = useTranslation();

  const [formData, setFormData] = useState<Record<string, any>>({ ...userData });
  const [error, setError] = useState<string>('');

  // --- Access change request sheet ---
  const [showAccessSheet, setShowAccessSheet] = useState(false);
  const [reqClinics, setReqClinics] = useState<string[]>([]);
  const [reqProjects, setReqProjects] = useState<string[]>([]);
  const [reqSubmitting, setReqSubmitting] = useState(false);
  const [reqError, setReqError] = useState('');
  const [reqSuccess, setReqSuccess] = useState('');

  // Track whether there is already a pending request
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (!show) return;
    apiClient
      .get('therapist/access-change-request/')
      .then((res: any) => setHasPending(Boolean(res?.data?.hasPending)))
      .catch(() => {});
  }, [show]);

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

  const openAccessSheet = () => {
    const currentClinics: string[] = Array.isArray(userData.clinics) ? userData.clinics : [];
    const currentProjects: string[] = Array.isArray(userData.projects) ? userData.projects : [];
    setReqClinics(currentClinics);
    setReqProjects(currentProjects.filter((p) => allowedProjectsForReq.includes(p)));
    setReqError('');
    setReqSuccess('');
    setShowAccessSheet(true);
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

  const handleOpenChange = (open: boolean) => {
    if (!open && !saving) onCancel();
  };

  const currentClinics: string[] = Array.isArray(userData.clinics) ? userData.clinics : [];
  const currentProjects: string[] = Array.isArray(userData.projects) ? userData.projects : [];

  // TODO: use new input components (e.g. InputField), create new components for uncovered input types
  return (
    <>
      <Sheet open={show} onOpenChange={handleOpenChange}>
        <SheetContent
          side="bottom"
          className="flex flex-col max-w-lg mx-auto overflow-y-auto max-h-[90vh]"
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>{t('Edit Info')}</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} aria-label={t('Edit Profile Form')}>
            {error && <ErrorAlert message={error} onClose={() => setError('')} />}

            <div className="space-y-4 py-2">
              {fields.map((field: any) => (
                <div key={field.be_name} className="space-y-1">
                  <Label htmlFor={field.be_name}>{t(field.label)}</Label>

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
                      value={(Array.isArray(formData[field.be_name])
                        ? formData[field.be_name]
                        : []
                      ).map((val: string) => ({ value: val, label: t(val) }))}
                      onChange={(selected) =>
                        handleMultiSelectChange(selected as any, field.be_name)
                      }
                      placeholder={t('Select...')}
                    />
                  ) : (
                    <Input
                      id={field.be_name}
                      type={field.type}
                      value={formData[field.be_name] || ''}
                      onChange={handleChange}
                      disabled={saving || field.be_name === 'email'}
                    />
                  )}
                </div>
              ))}

              {/* ── Clinic / Project: read-only display + request-change button ── */}
              <div className="rounded-xl border border-accent bg-zinc-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="mb-2">
                      <span className="text-sm font-semibold text-zinc-500">{t('Clinic')}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {currentClinics.length ? (
                          currentClinics.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
                            >
                              {c}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-zinc-400">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-zinc-500">{t('Projects')}</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {currentProjects.length ? (
                          currentProjects.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-700"
                            >
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-zinc-400">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openAccessSheet}
                      disabled={saving}
                      className="text-sm"
                    >
                      {t('Request access change')}
                    </Button>
                    {hasPending && (
                      <span className="text-xs font-medium text-amber-600">
                        {t('Change request pending admin approval')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <SheetFooter className="mt-4">
              <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
                {t('Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('Saving...') : t('Save Changes')}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Access change request sheet ── */}
      <Sheet
        open={showAccessSheet}
        onOpenChange={(open) => {
          if (!open && !reqSubmitting) setShowAccessSheet(false);
        }}
      >
        <SheetContent
          side="bottom"
          className="flex flex-col max-w-lg mx-auto overflow-y-auto max-h-[90vh]"
          onEscapeKeyDown={(event) => {
            if (reqSubmitting) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (reqSubmitting) event.preventDefault();
          }}
        >
          <SheetHeader>
            <SheetTitle>{t('Request clinic / project change')}</SheetTitle>
            <SheetDescription>
              {t(
                'Changes to your clinic and project access require admin approval. Your current access will remain unchanged until the request is reviewed. You will be notified by e-mail.'
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-2">
            {reqSuccess ? (
              <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-700">
                {reqSuccess}
              </div>
            ) : (
              <>
                {reqError && (
                  <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                    {reqError}
                    <button className="ml-2 underline" onClick={() => setReqError('')}>
                      ×
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <Label>{t('Requested clinics')}</Label>
                  <Select
                    isMulti
                    isDisabled={reqSubmitting}
                    options={allClinics.map((c) => ({ value: c, label: c }))}
                    value={reqClinics.map((c) => ({ value: c, label: c }))}
                    onChange={handleReqClinicsChange as any}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{t('Requested projects')}</Label>
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
                    <p className="text-xs text-zinc-500">
                      {t('Projects shown are those available for your selected clinics.')}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <SheetFooter className="mt-4">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowAccessSheet(false)}
              disabled={reqSubmitting}
            >
              {reqSuccess ? t('Close') : t('Cancel')}
            </Button>
            {!reqSuccess && (
              <Button
                type="button"
                onClick={submitAccessRequest}
                disabled={reqSubmitting || (!reqClinics.length && !reqProjects.length)}
              >
                {reqSubmitting ? t('Submitting...') : t('Submit request')}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
});

export default EditProfileSheet;
