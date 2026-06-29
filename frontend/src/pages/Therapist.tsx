// src/pages/Therapist.tsx
import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { Button, Col, Container, Form, Row, Card, Collapse } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import WelcomeArea from '@/components/common/WelcomeArea';
import PatientPopup from '@/components/TherapistPatientPage/PatientPopup';
import AddPatientPopup from '@/components/AddPatient/AddPatientPopUp';
import ImportFromRedcapModal from '@/components/TherapistPatientPage/ImportFromRedcapModal';
import Layout from '@/components/Layout';

import authStore from '@/stores/authStore';
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
import { Progress } from '@/components/ui/progress';

// -------------------- local, typed helpers (no any) --------------------

type Traffic = 'good' | 'warn' | 'bad' | 'unknown';

type InterventionFeedbackLike = {
  last_answered_at?: unknown;
  days_since_last?: unknown;
  answered_days_total?: unknown;
  recent_days_count?: unknown;
  recent_avg_score?: unknown;
  previous_avg_score?: unknown;
  trend_delta?: unknown;
  trend_lower?: unknown;
  low_ratings_14d?: unknown;
};

type PatientExtra = {
  _id?: unknown;
  username?: unknown;
  patient_code?: unknown;
  created_at?: unknown;

  last_online?: unknown;
  user_last_login?: unknown;
  last_login?: unknown;

  adherence_rate?: unknown;

  rehab_end_date?: unknown;

  last_feedback_at?: unknown;
  questionnaires?: unknown;
  intervention_feedback?: unknown;

  thresholds?: unknown;
  biomarker?: unknown;
  fitbitData?: unknown;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const getPatientExtra = (p: PatientType): PatientExtra => p as unknown as PatientExtra;

const getPatientIdStr = (p: PatientType): string => {
  const x = getPatientExtra(p);
  const code = typeof x.patient_code === 'string' ? x.patient_code : '';
  const uname = typeof x.username === 'string' ? x.username : '';
  const id = typeof x._id === 'string' ? x._id : '';
  return code || uname || (id ? id.slice(-8) : '') || '—';
};

const getPatientMongoId = (p: PatientType): string => {
  const x = getPatientExtra(p);
  return typeof x._id === 'string' ? x._id : '';
};

const getIsoMaybe = (v: unknown): string => (typeof v === 'string' ? v : '');

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

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    store.fetchPatients(t);
  }, [navigate, store, t]);

  // re-fetch after closing add patient popup
  const handleCloseAdd = useCallback(async () => {
    store.closeAddPatient();
    await store.fetchPatients(t);
  }, [store, t]);

  const handleRehabButton = useCallback(
    (id: string, name: string, pid: string) => {
      localStorage.setItem('selectedPatient', id);
      localStorage.setItem('selectedPatientName', name);
      localStorage.setItem('selectedPatientId', pid);
      navigate('/rehabtable');
    },
    [navigate]
  );

  const handleProgressButton = useCallback(
    (id: string, name: string, pid: string) => {
      localStorage.setItem('selectedPatient', id);
      localStorage.setItem('selectedPatientName', name);
      localStorage.setItem('selectedPatientId', pid);
      navigate('/health');
    },
    [navigate]
  );

  // helpers for display
  const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  const fmtDateTime = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const daysSince = (iso?: string) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  // ===== Ampel helpers =====
  const chipClass = (level: Traffic) => {
    switch (level) {
      case 'good':
        return 'bg-ok/5 border-ok text-ok';
      case 'warn':
        return 'bg-yellow/5 border-yellow text-yellow';
      case 'bad':
        return 'bg-nok/5 border-nok text-nok';
      default:
        return '';
    }
  };

  const levelToNum = (lvl: Traffic) =>
    lvl === 'bad' ? 3 : lvl === 'warn' ? 2 : lvl === 'unknown' ? 1 : 0;

  const levelRankSmallBadFirst = (lvl: Traffic) =>
    lvl === 'bad' ? 0 : lvl === 'warn' ? 1 : lvl === 'good' ? 2 : 0.5;

  const loginLevelAndTip = (p: PatientType): { level: Traffic; tip: string } => {
    const extra = getPatientExtra(p);
    const last =
      getIsoMaybe(extra.last_online) ||
      getIsoMaybe(extra.user_last_login) ||
      getIsoMaybe(extra.last_login) ||
      '';
    const d = daysSince(last);

    let level: Traffic = 'unknown';
    if (d === Number.POSITIVE_INFINITY) level = 'unknown';
    else if (d <= 3) level = 'good';
    else if (d <= 7) level = 'warn';
    else level = 'bad';

    return {
      level,
      tip: last
        ? `${t('Last login')}: ${fmtDateTime(last)} (${d} ${t('days ago')})`
        : String(t('Never logged in')),
    };
  };

  const adherenceLevelAndTip = (p: PatientType): { level: Traffic; tip: string } => {
    const extra = getPatientExtra(p);
    const rate = toNum(extra.adherence_rate);

    let level: Traffic = 'unknown';
    if (typeof rate === 'number') {
      if (rate >= 80) level = 'good';
      else if (rate >= 50) level = 'warn';
      else level = 'bad';
    }

    return {
      level,
      tip:
        typeof rate === 'number'
          ? `${t('Completed in last 7d')}: ${rate}%`
          : String(t('No adherence data')),
    };
  };

  const feedbackLevelAndTip = (p: PatientType): { level: Traffic; tip: string } => {
    const extra = getPatientExtra(p);
    const summary = asRecord(extra.intervention_feedback) as InterventionFeedbackLike;

    const lastIso = getIsoMaybe(summary.last_answered_at);
    const daysSinceLast = toNum(summary.days_since_last);
    const answeredDaysTotal = toNum(summary.answered_days_total) ?? 0;
    const lowRatings14d = toNum(summary.low_ratings_14d) ?? 0;

    // Grey: no star rating ever submitted
    if (answeredDaysTotal === 0 || !lastIso) {
      return { level: 'unknown', tip: String(t('No feedback ever submitted')) };
    }

    const daysStr = daysSinceLast != null ? ` (${daysSinceLast} ${t('days ago')})` : '';

    let level: Traffic;

    // Red: no rating for >30 days OR ≥7 low ratings (≤2★) in last 14 days
    if ((daysSinceLast != null && daysSinceLast > 30) || lowRatings14d >= 7) {
      level = 'bad';
    }
    // Yellow: no rating for 15–30 days OR ≥3 low ratings in last 14 days
    else if ((daysSinceLast != null && daysSinceLast > 14) || lowRatings14d >= 3) {
      level = 'warn';
    }
    // Green: rating within last 14 days and <3 low ratings
    else {
      level = 'good';
    }

    const tip = [
      `${t('Last star rating')}: ${fmtDateTime(lastIso)}${daysStr}`,
      `${t('Low ratings (≤2 stars) in last 14 days')}: ${lowRatings14d}`,
    ].join(' • ');

    return { level, tip };
  };

  const ampelComposite = (p: PatientType) => {
    const l = loginLevelAndTip(p);
    const a = adherenceLevelAndTip(p);
    const f = feedbackLevelAndTip(p);

    const base = levelToNum(l.level) + levelToNum(a.level) + levelToNum(f.level);

    const extra = getPatientExtra(p);
    const lastLogin =
      getIsoMaybe(extra.last_online) ||
      getIsoMaybe(extra.user_last_login) ||
      getIsoMaybe(extra.last_login) ||
      '';
    const dLogin = daysSince(lastLogin);

    const adh = toNum(extra.adherence_rate) ?? -1;

    // last questionnaire answer (string-sort works for ISO yyyy-mm-dd or ISO datetime)
    const lastQ = Array.isArray(extra.questionnaires)
      ? (extra.questionnaires as unknown[])
          .map((q) => asRecord(q).last_answered_at as unknown)
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
          .sort()
          .slice(-1)[0] || ''
      : '';

    const lastFbISO = lastQ || getIsoMaybe(extra.last_feedback_at) || '';
    const dFb = daysSince(lastFbISO);

    const tweak =
      (Number.isFinite(dLogin) ? dLogin / 50 : 0) +
      (adh >= 0 ? (100 - adh) / 100 : 0.5) +
      (Number.isFinite(dFb) ? dFb / 100 : 0.25);

    return base + tweak;
  };

  const renderLoginBadge = (p: PatientType) => {
    const extra = getPatientExtra(p);
    const last =
      getIsoMaybe(extra.last_online) ||
      getIsoMaybe(extra.user_last_login) ||
      getIsoMaybe(extra.last_login) ||
      '';
    const d = daysSince(last);

    let level: Traffic = 'unknown';
    if (d === Number.POSITIVE_INFINITY) level = 'unknown';
    else if (d <= 3) level = 'good';
    else if (d <= 7) level = 'warn';
    else level = 'bad';

    let badgeText = t('Never logged in');
    if (last) {
      if (d === 0) badgeText = t('today');
      else if (d === 1) badgeText = t('yesterday');
      else badgeText = t('daysAgoShort', { d });
    }

    return (
      <Badge variant="dashboard" className={`text-nowrap ${chipClass(level)}`}>
        {badgeText}
      </Badge>
    );
  };

  const renderAdherenceBadge = (p: PatientType) => {
    const extra = getPatientExtra(p);
    const rate = toNum(extra.adherence_rate);

    let level: Traffic = 'unknown';
    if (typeof rate === 'number') {
      if (rate >= 80) level = 'good';
      else if (rate >= 50) level = 'warn';
      else level = 'bad';
    }

    const indicatorClassName =
      level === 'bad' ? 'bg-nok' : level === 'warn' ? 'bg-yellow' : level === 'good' ? 'bg-ok' : '';

    const labelClassName =
      level === 'bad'
        ? 'text-nok'
        : level === 'warn'
          ? 'text-yellow'
          : level === 'good'
            ? 'text-ok'
            : 'text-chartMuted';

    return (
      <div className="flex items-center gap-2">
        <Progress
          value={rate ?? 0}
          max={100}
          indicatorClassName={indicatorClassName}
          className={`w-10 h-1`}
        />
        <span className={`text-xs font-medium ${labelClassName}`}>
          {rate != null ? `${rate}%` : '—'}
        </span>
      </div>
    );
  };

  const renderFeedbackBadge = (p: PatientType) => {
    const extra = getPatientExtra(p);
    const summary = asRecord(extra.intervention_feedback) as InterventionFeedbackLike;

    const lastIso = getIsoMaybe(summary.last_answered_at);
    const daysSinceLast = toNum(summary.days_since_last);
    const lowRatings14d = toNum(summary.low_ratings_14d) ?? 0;

    let level: Traffic;
    let badgeText;

    if (summary.answered_days_total === 0 || !lastIso) {
      level = 'unknown';
      badgeText = t('No feedback');
    } else if ((daysSinceLast != null && daysSinceLast > 30) || lowRatings14d >= 7) {
      level = 'bad';
      badgeText =
        lowRatings14d >= 7
          ? t('negRatingsShort', { n: lowRatings14d })
          : t('daysAgoShort', { d: daysSinceLast });
    } else if ((daysSinceLast != null && daysSinceLast > 14) || lowRatings14d >= 3) {
      level = 'warn';
      badgeText =
        lowRatings14d >= 3
          ? t('negRatingsShort', { n: lowRatings14d })
          : t('daysAgoShort', { d: daysSinceLast });
    } else {
      level = 'good';
      badgeText = t('Good');
    }

    return (
      <Badge variant="dashboard" className={`text-nowrap ${chipClass(level)}`}>
        {badgeText}
      </Badge>
    );
  };

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
    const getFb = (p: PatientType) => levelRankSmallBadFirst(feedbackLevelAndTip(p).level);

    const dir = (key: string, val: number) => (colSortDir[key] === 'desc' ? -val : val);

    arr.sort((a, b) => {
      switch (store.sortBy) {
        case 'ampel':
          return ampelComposite(b) - ampelComposite(a);
        case 'last_login':
          return dir('last_login', getLogin(a) - getLogin(b));
        case 'adherence':
          return dir('adherence', getAdh(b) - getAdh(a));
        case 'feedback':
          return dir('feedback', getFb(a) - getFb(b));
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

      <div className="d-flex flex-column mt-4">
        <Container>
          {store.error && (
            <Row className="mb-3">
              <Col>
                <div className="alert alert-danger d-flex justify-content-between align-items-start">
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
                  <div className="ms-3 d-flex flex-column gap-2 align-items-end">
                    {store.errorDetails && (
                      <Button size="sm" variant="outline-light" onClick={store.toggleErrorDetails}>
                        {store.showErrorDetails
                          ? String(t('Hide details'))
                          : String(t('Show details'))}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="light"
                      onClick={() => store.fetchPatients(t)}
                      disabled={store.loading}
                    >
                      {store.loading ? String(t('Loading...')) : String(t('Retry'))}
                    </Button>
                  </div>
                </div>
              </Col>
            </Row>
          )}

          <Row className="mb-3">
            <Col className="d-flex gap-2 flex-wrap">
              {!appModeStore.loaded ? (
                <>
                  <Skeleton className="h-9 w-36 rounded" />
                  <Skeleton className="h-9 w-40 rounded" />
                </>
              ) : (
                <>
                  {appModeStore.showManualCreate && (
                    <Button onClick={store.openAddPatient} disabled={store.loading}>
                      {String(t('Add a New Patient'))}
                    </Button>
                  )}

                  {appModeStore.showRedcapImport && (
                    <Button
                      variant="outline-primary"
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
            </Col>
          </Row>

          <Card className="mb-3">
            <Card.Body>
              <Row className="g-3">
                <Col xs={12} md={3}>
                  <Form.Control
                    type="text"
                    placeholder={String(t('Search by name, ID or username'))}
                    value={store.searchTerm}
                    onChange={(e) => store.setSearchTerm(e.target.value)}
                  />
                </Col>

                <Col xs={12} md={3}>
                  <Form.Control
                    type="date"
                    value={store.birthdateFilter}
                    onChange={(e) => store.setBirthdateFilter(e.target.value)}
                    aria-label={String(t('Filter by Birth Date'))}
                  />
                </Col>

                <Col xs={12} md={3}>
                  <Form.Select
                    value={store.sexFilter}
                    onChange={(e) => store.setSexFilter(e.target.value)}
                  >
                    <option value="">{String(t('Filter by Sex'))}</option>
                    {sexOptions.map((sex) => (
                      <option key={sex} value={sex}>
                        {String(t(sex))}
                      </option>
                    ))}
                  </Form.Select>
                </Col>

                <Col xs={12} md={3}>
                  <Form.Select
                    value={store.durationFilter}
                    onChange={(e) => store.setDurationFilter(e.target.value)}
                  >
                    <option value="">{String(t('Filter by Duration'))}</option>
                    {durationOptions.map((duration) => (
                      <option key={duration} value={duration}>
                        {String(t(duration))}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              <Row className="mt-3 align-items-center">
                <Col xs={12} md={3}>
                  <Form.Select
                    value={store.diseaseFilter}
                    onChange={(e) => store.setDiseaseFilter(e.target.value)}
                  >
                    <option value="">{String(t('Filter by Disease'))}</option>
                    {store.diseaseOptions.map((d) => (
                      <option key={d} value={d}>
                        {String(t(d))}
                      </option>
                    ))}
                  </Form.Select>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Label className="me-2">{String(t('Sort by'))}</Form.Label>
                  <Form.Select
                    aria-label="Sort by"
                    value={store.sortBy}
                    onChange={(e) => store.setSortBy(e.target.value as SortKey)}
                    style={{ maxWidth: 320, display: 'inline-block' }}
                  >
                    <option value="ampel">{String(t('Performance'))}</option>
                    <option value="created">{String(t('Newest created'))}</option>
                  </Form.Select>
                </Col>

                <Col className="d-flex flex-wrap gap-3 justify-content-end">
                  <Button variant="outline-secondary" onClick={store.resetFilters}>
                    {String(t('Reset filters'))}
                  </Button>
                </Col>

                <Col className="d-flex flex-wrap gap-3 justify-content-end">
                  <Form.Check
                    type="switch"
                    id="toggle-completed"
                    label={String(t('Show completed'))}
                    checked={store.showCompleted}
                    onChange={(e) => store.setShowCompleted(e.currentTarget.checked)}
                  />
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <h5 className="mb-2">
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
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleColSort('adherence')}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <div className="flex gap-1 items-center">
                    {t('Adherence')}
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead
                  onClick={() => handleColSort('feedback')}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                >
                  <div className="flex gap-1 items-center">
                    {t('Feedback')}
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>{t('Actions')}</TableHead>
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
                  <TableRow key={mongoId || patientId}>
                    <TableCell className="text-muted">{patientId}</TableCell>
                    <TableCell>{fullName}</TableCell>
                    <TableCell className="text-muted">{fmtDate(String(p.age || ''))}</TableCell>
                    <TableCell className="text-muted">{String(t(p.sex))}</TableCell>
                    <TableCell className="text-muted">{diagnosis}</TableCell>
                    <TableCell>{renderLoginBadge(p)}</TableCell>
                    <TableCell>{renderAdherenceBadge(p)}</TableCell>
                    <TableCell>{renderFeedbackBadge(p)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant="success" onClick={() => store.openPatient(p)}>
                          {String(t('Info'))}
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleRehabButton(mongoId, fullName, patientId)}
                        >
                          {String(t('Rehabilitation Plan'))}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-primary"
                          onClick={() => handleProgressButton(mongoId, fullName, patientId)}
                        >
                          {String(t('Outcomes Dashboard'))}
                        </Button>
                      </div>
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

          <Collapse in={store.showCompleted}>
            <div>
              <h5 className="mt-4 mb-2">
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
                    <TableHead>{t('Actions')}</TableHead>
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
                      <TableRow key={mongoId || patientId} className="completed-row opacity-75">
                        <TableCell className="text-muted">{patientId}</TableCell>
                        <TableCell>{fullName}</TableCell>
                        <TableCell className="text-muted">{fmtDate(String(p.age || ''))}</TableCell>
                        <TableCell className="text-muted">{String(t(p.sex))}</TableCell>
                        <TableCell className="text-muted">{diagnosis}</TableCell>
                        <TableCell>
                          <Badge variant="dashboard" className="bg-ok/5 border-ok text-ok">
                            {String(t('Completed'))}
                          </Badge>
                          {!endDate && (
                            <div className="text-xs text-muted mt-1">
                              {String(t('Discharged'))}: {fmtDate(endDate)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant="success"
                              onClick={() => store.openPatient(p)}
                            >
                              {String(t('Info'))}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-primary"
                              onClick={() => handleProgressButton(mongoId, fullName, patientId)}
                            >
                              {String(t('Outcomes Dashboard'))}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {completedPatients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted">
                        {String(t('No completed patients'))}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Collapse>
        </Container>

        {store.selectedPatient && (
          <PatientPopup
            patient_id={store.selectedPatient}
            show={store.showPatientPopup}
            handleClose={store.closePatient}
          />
        )}

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
