import React from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Button } from '@/components/ui/button';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import PasswordResetSheet from '@/components/TherapistPatientPage/PasswordResetSheet';
import DeleteConfirmationSheet from '@/components/TherapistPatientPage/DeleteConfirmationSheet';
import {
  Check,
  CloudDownload,
  HardDriveDownload,
  KeyRound,
  Pencil,
  RefreshCw,
  UserRoundX,
  X,
} from 'lucide-react';

interface PatientInfoActionToolbarProps {
  store: PatientPopupStore;
  onDeleted: () => void;
}

const PatientInfoActionToolbar: React.FC<PatientInfoActionToolbarProps> = observer(
  ({ store, onDeleted }) => {
    const { t } = useTranslation();
    const hasRedcap = (store.redcapRows?.length || 0) > 0;

    const handleDelete = async () => {
      const ok = await store.deletePatient(t);
      if (!ok) return;
      store.setShowConfirmDelete(false);
      onDeleted();
    };

    return (
      <>
        <div className="flex flex-wrap gap-2 mb-3">
          {store.isEditing ? (
            <>
              <Button
                variant="secondary"
                size="dashboard"
                onClick={() => store.setEditing(false)}
                disabled={store.saving}
              >
                <X />
                {t('Cancel')}
              </Button>

              {hasRedcap && (
                <Button
                  variant="secondary"
                  size="dashboard"
                  onClick={() => store.copyRedcapIntoManual()}
                  disabled={store.saving}
                  title={t('Copy missing fields from REDCap into the manual form')}
                >
                  <CloudDownload />
                  {t('Copy from REDCap')}
                </Button>
              )}

              <Button size="dashboard" onClick={() => store.saveAll(t)} disabled={store.saving}>
                <Check />
                {store.saving ? t('Saving...') : t('SaveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="dashboard"
                onClick={() => store.setEditing(true)}
                disabled={store.loading || store.saving}
              >
                <Pencil />
                {t('Edit')}
              </Button>

              <Button
                variant="secondary"
                size="dashboard"
                onClick={() => store.fetchRedcapIfPossible(t)}
                disabled={store.loading || store.redcapLoading}
                title={t('Refresh REDCap data')}
              >
                <RefreshCw />
                {store.redcapLoading ? t('Loading...') : t('Refresh REDCap')}
              </Button>

              {store.redcapProject && (
                <>
                  <Button
                    variant="secondary"
                    size="dashboard"
                    onClick={() => store.syncWearablesToRedcap(t)}
                    disabled={store.loading || store.wearablesSyncing}
                    title={t(
                      'Sync Fitbit wearables data to REDCap (skips periods already populated)'
                    )}
                  >
                    <HardDriveDownload />
                    {store.wearablesSyncing ? t('Syncing...') : t('Sync Wearables')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="dashboard"
                    className="text-yellow"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            'Force re-sync will overwrite existing wearables data in REDCap. Continue?'
                          )
                        )
                      ) {
                        store.syncWearablesToRedcap(t, undefined, undefined, true);
                      }
                    }}
                    disabled={store.loading || store.wearablesSyncing}
                    title={t('Force re-sync overwrites existing REDCap wearables data')}
                  >
                    <HardDriveDownload />
                    {t('Force Re-sync')}
                  </Button>
                </>
              )}

              <Button
                size="dashboard"
                onClick={() => store.setShowPasswordReset(true)}
                disabled={store.loading || store.saving}
                className="bg-yellow hover:bg-yellow/90"
              >
                <KeyRound />
                {t('ResetPassword')}
              </Button>

              <Button
                size="dashboard"
                onClick={() => store.setShowConfirmDelete(true)}
                aria-label={t('DeletePatient')}
                disabled={store.loading || store.saving}
                className="bg-nok hover:bg-nok/90"
              >
                <UserRoundX />
                {t('DeletePatient')}
              </Button>
            </>
          )}
        </div>

        <PasswordResetSheet
          open={store.showPasswordReset}
          onOpenChange={(v) => store.setShowPasswordReset(v)}
          passwordNew={store.passwordNew}
          passwordConfirm={store.passwordConfirm}
          passwordError={store.passwordError}
          passwordSuccess={store.passwordSuccess}
          passwordSaving={store.passwordSaving}
          onPasswordNewChange={(v) => store.setPasswordNew(v)}
          onPasswordConfirmChange={(v) => store.setPasswordConfirm(v)}
          onSubmit={() => store.resetPassword(t)}
        />

        <DeleteConfirmationSheet
          open={store.showConfirmDelete}
          onOpenChange={(v) => store.setShowConfirmDelete(v)}
          saving={store.saving}
          onConfirm={handleDelete}
        />
      </>
    );
  }
);

export default PatientInfoActionToolbar;
