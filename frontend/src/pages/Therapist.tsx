// src/pages/Therapist.tsx
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import WelcomeArea from '@/components/common/WelcomeArea';
import AddPatientPopup from '@/components/AddPatient/AddPatientPopUp';
import ImportFromRedcapModal from '@/components/TherapistPatientPage/ImportFromRedcapModal';
import PatientFilters from '@/components/TherapistPatientPage/PatientFilters';
import {
  LoginBadge,
  AdherenceProgress,
  FeedbackBadge,
  WearBadge,
} from '@/components/TherapistPatientPage/PatientStatusBadges';
import Layout from '@/components/Layout';

import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
import config from '@/config/config.json';

import { TherapistPatientsStore, SortKey, RedcapCandidate } from '@/stores/therapistPatientsStore';
import type { PatientType } from '@/types';
import { appModeStore } from '@/stores/appModeStore';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ampelComposite,
  daysSince,
  feedbackLevel,
  fmtDate,
  getIsoMaybe,
  getPatientExtra,
  getPatientIdStr,
  getPatientMongoId,
  getWearInfo,
  levelRankSmallBadFirst,
  toNum,
} from '@/utils/patientStatus';

// config typing used on this page
type AppConfig = {
  RehaInfo?: unknown;
  patientInfo?: {
    sex?: unknown;
  };
};

const appCfg = config as unknown as AppConfig;

const durationOptions: string[] = Array.isArray(appCfg?.RehaInfo)
  ? (appCfg.RehaInfo as unknown[]).map((x) => String(x))
  : [];

const sexOptions: string[] = Array.isArray(appCfg?.patientInfo?.sex)
  ? (appCfg.patientInfo!.sex as unknown[]).map((x) => String(x))
  : [];

// -------------------- component --------------------

const Therapist: React.FC = observer(() => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const store = useMemo(() => new TherapistPatientsStore(), []);
  const [colSortDir, setColSortDir] = useState<Record<string, 'asc' | 'desc'>>({});

  const { isAllowed } = useRoleAuthGate('Therapist');

  useEffect(() => {
    if (!isAllowed) return;
    store.fetchPatients(t);
  }, [isAllowed, store, t]);

  // re-fetch after closing add patient popup
  const handleCloseAdd = useCallback(async () => {
    store.closeAddPatient();
    await store.fetchPatients(t);
  }, [store, t]);

  const handlePatientClick = useCallback(
    (patientId: string) => {
      navigate(`/therapist-patient-detail/${patientId}`);
    },
    [navigate]
  );

  const handleColSort = useCallback(
    (key: SortKey) => {
      if (store.sortBy === key) {
        setColSortDir((prev) => ({ ...prev, [key]: prev[key] === 'asc' ? 'desc' : 'asc' }));
      } else {
        store.setSortBy(key);
        setColSortDir((prev) => ({ ...prev, [key]: 'asc' }));
      }
    },
    [store]
  );

  const renderSortIcon = (key: SortKey) => {
    if (store.sortBy !== key) {
      return <ArrowUpDown className="h-4 w-4 text-chartMuted" />;
    }
    return colSortDir[key] === 'desc' ? (
      <ArrowDown className="h-4 w-4" />
    ) : (
      <ArrowUp className="h-4 w-4" />
    );
  };

  // ===== Sorting (includes ampel) =====
  const sortedFiltered = useMemo(() => {
    const arr = [...store.filteredPatients];

    const getLogin = (p: PatientType) => {
      const x = getPatientExtra(p);
      const last =
        getIsoMaybe(x.last_online) ||
        getIsoMaybe(x.user_last_login) ||
        getIsoMaybe(x.last_login) ||
        '';
      return daysSince(last);
    };
    const getAdh = (p: PatientType) => toNum(getPatientExtra(p).adherence_rate) ?? -1;
    const getFb = (p: PatientType) => levelRankSmallBadFirst(feedbackLevel(p));
    const getWear = (p: PatientType) => levelRankSmallBadFirst(getWearInfo(p).level);

    const dir = (key: string, val: number) => (colSortDir[key] === 'desc' ? -val : val);

    // All comparators below follow the same "asc = worst first" convention as
    // the default ampel sort, so toggling direction means the same thing on
    // every column.
    arr.sort((a, b) => {
      switch (store.sortBy) {
        case 'ampel':
          return ampelComposite(b) - ampelComposite(a);
        case 'last_login':
          return dir('last_login', getLogin(b) - getLogin(a));
        case 'adherence':
          return dir('adherence', getAdh(a) - getAdh(b));
        case 'feedback':
          return dir('feedback', getFb(a) - getFb(b));
        case 'wear':
          return dir('wear', getWear(a) - getWear(b));
        case 'created':
        default: {
          const xa = getPatientExtra(a);
          const xb = getPatientExtra(b);
          const da = new Date(getIsoMaybe(xa.created_at) || 0).getTime();
          const db = new Date(getIsoMaybe(xb.created_at) || 0).getTime();
          return db - da;
        }
      }
    });

    return arr;
  }, [store.filteredPatients, store.sortBy, colSortDir]);

  const { active: activePatients, completed: completedPatients } = useMemo(
    () => store.splitCompleted(sortedFiltered),
    [store, sortedFiltered]
  );

  return (
    <Layout>
      <WelcomeArea user="therapist" />

      <div className="flex gap-2 flex-col mt-3">
        {store.error && (
          <div className="alert alert-danger flex justify-content-between items-start">
            <div>
              <div>{store.error}</div>
              {store.showErrorDetails && store.errorDetails && (
                <pre
                  className="bg-light p-2 mt-2 border rounded small"
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {store.errorDetails}
                </pre>
              )}
            </div>
            <div className="ml-3 flex flex-col gap-2 items-end">
              {store.errorDetails && (
                <Button size="dashboard" variant="secondary" onClick={store.toggleErrorDetails}>
                  {store.showErrorDetails ? String(t('Hide details')) : String(t('Show details'))}
                </Button>
              )}
              <Button
                size="dashboard"
                variant="secondary"
                onClick={() => store.fetchPatients(t)}
                disabled={store.loading}
              >
                {store.loading ? String(t('Loading...')) : String(t('Retry'))}
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!appModeStore.loaded ? (
            <>
              <Skeleton className="h-9 w-36 rounded" />
              <Skeleton className="h-9 w-40 rounded" />
            </>
          ) : (
            <>
              {appModeStore.showManualCreate && (
                <Button size="dashboard" onClick={store.openAddPatient} disabled={store.loading}>
                  {String(t('Add a New Patient'))}
                </Button>
              )}

              {appModeStore.showRedcapImport && (
                <Button
                  size="dashboard"
                  variant="secondary"
                  onClick={async () => {
                    store.openImportRedcap();
                    await store.fetchRedcapCandidates(t);
                  }}
                  disabled={store.loading}
                >
                  {String(t('Import from REDCap'))}
                </Button>
              )}
            </>
          )}
        </div>

        <PatientFilters store={store} sexOptions={sexOptions} durationOptions={durationOptions} />

        <h5>
          {String(t('Active patients'))} ({activePatients.length})
        </h5>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>{t('Name')}</TableHead>
              <TableHead>{t('Birth Date')}</TableHead>
              <TableHead>{t('Sex')}</TableHead>
              <TableHead>{t('Diagnosis_patient_list')}</TableHead>
              <TableHead
                onClick={() => handleColSort('last_login')}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <div className="flex gap-1 items-center">
                  {t('Login')}
                  {renderSortIcon('last_login')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => handleColSort('adherence')}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <div className="flex gap-1 items-center">
                  {t('Adherence')}
                  {renderSortIcon('adherence')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => handleColSort('feedback')}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <div className="flex gap-1 items-center">
                  {t('Feedback')}
                  {renderSortIcon('feedback')}
                </div>
              </TableHead>
              <TableHead
                onClick={() => handleColSort('wear')}
                className="cursor-pointer transition-colors hover:bg-muted/50"
              >
                <div className="flex gap-1 items-center">
                  {t('Wear')}
                  {renderSortIcon('wear')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activePatients.map((p) => {
              const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
              const diagnosis = Array.isArray(p.diagnosis)
                ? p.diagnosis.map((d) => String(t(d))).join(', ')
                : String(t(p.diagnosis || ''));
              const patientId = getPatientIdStr(p);
              const mongoId = getPatientMongoId(p);

              return (
                <TableRow
                  key={mongoId || patientId}
                  role="link"
                  tabIndex={0}
                  onClick={() => handlePatientClick(mongoId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePatientClick(mongoId);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="text-muted">{patientId}</TableCell>
                  <TableCell>{fullName}</TableCell>
                  <TableCell className="text-muted">{fmtDate(String(p.age || ''))}</TableCell>
                  <TableCell className="text-muted">{String(t(p.sex))}</TableCell>
                  <TableCell className="text-muted">{diagnosis}</TableCell>
                  <TableCell>
                    <LoginBadge patient={p} />
                  </TableCell>
                  <TableCell>
                    <AdherenceProgress patient={p} />
                  </TableCell>
                  <TableCell>
                    <FeedbackBadge patient={p} />
                  </TableCell>
                  <TableCell>
                    <WearBadge patient={p} />
                  </TableCell>
                </TableRow>
              );
            })}

            {activePatients.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted">
                  {store.loading
                    ? String(t('Loading patients...'))
                    : String(t('No active patients'))}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Collapsible open={store.showCompleted}>
          <CollapsibleContent className="mt-4 flex flex-col gap-2">
            <h5>
              {String(t('Completed'))} ({completedPatients.length})
            </h5>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{t('Name')}</TableHead>
                  <TableHead>{t('Birth Date')}</TableHead>
                  <TableHead>{t('Sex')}</TableHead>
                  <TableHead>{t('Diagnosis_patient_list')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedPatients.map((p) => {
                  const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
                  const diagnosis = Array.isArray(p.diagnosis)
                    ? p.diagnosis.map((d) => String(t(d))).join(', ')
                    : String(t(p.diagnosis || ''));
                  const patientId = getPatientIdStr(p);
                  const mongoId = getPatientMongoId(p);

                  const extra = getPatientExtra(p);
                  const endDate = getIsoMaybe(extra.rehab_end_date);

                  return (
                    <TableRow
                      key={mongoId || patientId}
                      role="link"
                      tabIndex={0}
                      onClick={() => handlePatientClick(mongoId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePatientClick(mongoId);
                        }
                      }}
                      className="cursor-pointer completed-row opacity-75"
                    >
                      <TableCell className="text-muted">{patientId}</TableCell>
                      <TableCell>{fullName}</TableCell>
                      <TableCell className="text-muted">{fmtDate(String(p.age || ''))}</TableCell>
                      <TableCell className="text-muted">{String(t(p.sex))}</TableCell>
                      <TableCell className="text-muted">{diagnosis}</TableCell>
                      <TableCell>
                        <Badge variant="dashboard" className="bg-ok/5 border-ok text-ok">
                          {String(t('Completed'))}
                        </Badge>
                        {endDate && (
                          <div className="text-xs text-muted mt-1">
                            {String(t('Discharged'))}: {fmtDate(endDate)}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {completedPatients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted">
                      {String(t('No completed patients'))}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>

        {appModeStore.showManualCreate && (
          <AddPatientPopup show={store.showAddPatientPopup} handleClose={handleCloseAdd} />
        )}

        {appModeStore.showRedcapImport && (
          <ImportFromRedcapModal
            show={store.showImportRedcapModal}
            onHide={store.closeImportRedcap}
            loading={store.redcapLoading}
            error={store.redcapError || ''}
            candidates={store.redcapCandidates ?? []}
            rowPasswords={store.redcapRowPasswords ?? {}}
            setRowPassword={store.setRedcapRowPassword}
            importingKey={store.importingKey}
            importedKeys={store.importedKeys ?? {}}
            onRefresh={() => store.fetchRedcapCandidates(t)}
            onImportOne={(c: RedcapCandidate) => store.importOneFromRedcap(c, t)}
          />
        )}
      </div>
    </Layout>
  );
});

export default Therapist;
