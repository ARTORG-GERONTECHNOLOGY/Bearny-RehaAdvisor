import React from 'react';
import { Spinner, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  therapistName: string;
  loading: boolean;
  error: string | null;
  success: string | null;
  availableProjects: string[];
  allowedClinics: string[];
  selectedProjects: string[];
  selectedClinics: string[];
  onToggleProject: (project: string) => void;
  onToggleClinic: (clinic: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDismissError: () => void;
  onDismissSuccess: () => void;
}

const TherapistAccessDialog: React.FC<Props> = ({
  open,
  therapistName,
  loading,
  error,
  success,
  availableProjects,
  allowedClinics,
  selectedProjects,
  selectedClinics,
  onToggleProject,
  onToggleClinic,
  onClose,
  onSave,
  onDismissError,
  onDismissSuccess,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogContent
        className="max-w-3xl"
        hideClose={loading}
        onPointerDownOutside={(e) => loading && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {t('Therapist access')} — {therapistName}
          </DialogTitle>
        </DialogHeader>

        {success && (
          <Alert variant="success" dismissible onClose={onDismissSuccess}>
            {success}
          </Alert>
        )}

        {error && (
          <Alert variant="danger" dismissible onClose={onDismissError}>
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="d-flex align-items-center gap-2">
            <Spinner animation="border" size="sm" />
            <div>{t('Loading')}...</div>
          </div>
        ) : (
          <>
            <p className="text-muted mb-2">{t('Projects')}</p>
            {availableProjects.length === 0 ? (
              <Alert variant="warning">{t('No projects configured on the server.')}</Alert>
            ) : (
              <div className="mb-3">
                <div className="d-flex flex-wrap gap-3">
                  {availableProjects.map((p) => {
                    const id = `proj_${p}`;
                    return (
                      <div key={p} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={selectedProjects.includes(p)}
                          onCheckedChange={() => onToggleProject(p)}
                        />
                        <Label htmlFor={id} className="cursor-pointer">
                          {p}
                        </Label>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2">
                  <small className="text-muted">
                    {t('Selected')}: {selectedProjects.length ? selectedProjects.join(', ') : '—'}
                  </small>
                </div>
              </div>
            )}

            <p className="text-muted mb-2">{t('Clinics')}</p>
            {!selectedProjects.length ? (
              <Alert variant="info" className="mb-0">
                {t('Select a project to see available clinics.')}
              </Alert>
            ) : allowedClinics.length === 0 ? (
              <Alert variant="warning" className="mb-0">
                {t('No clinics are configured for the selected project(s).')}
              </Alert>
            ) : (
              <div className="d-flex flex-wrap gap-3">
                {allowedClinics.map((c) => {
                  const id = `clinic_${c}`;
                  return (
                    <div key={c} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={selectedClinics.includes(c)}
                        onCheckedChange={() => onToggleClinic(c)}
                      />
                      <Label htmlFor={id} className="cursor-pointer">
                        {c}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedProjects.length > 0 && (
              <div className="mt-2">
                <small className="text-muted">
                  {t('Clinics are filtered by selected projects.')}
                </small>
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={onClose} disabled={loading}>
            {t('Close')}
          </Button>
          <Button
            size="dashboard"
            onClick={onSave}
            disabled={loading || selectedProjects.length === 0}
            title={selectedProjects.length === 0 ? t('Select at least one project') : undefined}
          >
            {loading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                {t('Saving')}...
              </>
            ) : (
              t('Save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TherapistAccessDialog;
