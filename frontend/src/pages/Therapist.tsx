// src/pages/Therapist.tsx
import React, { useEffect, useMemo, useCallback } from 'react';
import {
  Button,
  Col,
  Container,
  Form,
  Row,
  Card,
  Table,
  Collapse,
  Badge,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import PatientPopup from '../components/TherapistPatientPage/PatientPopup';
import AddPatientPopup from '../components/AddPatient/AddPatientPopUp';
import ImportFromRedcapModal from '../components/TherapistPatientPage/ImportFromRedcapModal';

import authStore from '../stores/authStore';
import config from '../config/config.json';

import { TherapistPatientsStore, SortKey, RedcapCandidate } from '../stores/therapistPatientsStore';
import type { PatientType } from '../types';

// -------------------- local, typed helpers (no any) --------------------

type Traffic = 'good' | 'warn' | 'bad' | 'unknown';

type BioLike = {
  sleep_avg_h?: unknown;
  steps_avg?: unknown;
  activity_min?: unknown;
  bp_sys_avg?: unknown;
  bp_dia_avg?: unknown;
  wear_time_avg_min?: unknown;
  wear_time_days_since?: unknown;
};

type ThresholdsLike = {
  steps_goal?: unknown;
  active_minutes_green?: unknown;
  active_minutes_yellow?: unknown;
  sleep_green_min?: unknown;
  sleep_yellow_min?: unknown;
  bp_sys_green_max?: unknown;
  bp_sys_yellow_max?: unknown;
  bp_dia_green_max?: unknown;
  bp_dia_yellow_max?: unknown;
};

type InterventionFeedbackLike = {
  last_answered_at?: unknown;
  days_since_last?: unknown;
  answered_days_total?: unknown;
  recent_days_count?: unknown;
  recent_avg_score?: unknown;
  previous_avg_score?: unknown;
  trend_delta?: unknown;
  trend_lower?: unknown;
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

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    store.fetchPatients(t);

    // NOTE: your eslint currently complains: "Definition for rule react-hooks/exhaustive-deps was not found".
    // That is a lint-config issue (missing eslint-plugin-react-hooks). Removing the disable-comment avoids the error.
  }, [navigate, store, t]);

  // re-fetch after closing add patient popup
  const handleCloseAdd = useCallback(async () => {
    store.closeAddPatient();
    await store.fetchPatients(t);
  }, [store, t]);

  const handleRehabButton = useCallback(
    (id: string, name: string) => {
      localStorage.setItem('selectedPatient', id);
      localStorage.setItem('selectedPatientName', name);
      navigate('/rehabtable');
    },
    [navigate]
  );

  const handleProgressButton = useCallback(
    (id: string, name: string) => {
      localStorage.setItem('selectedPatient', id);
      localStorage.setItem('selectedPatientName', name);
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
        return 'bg-success';
      case 'warn':
        return 'bg-warning text-dark';
      case 'bad':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  };

  const levelToNum = (lvl: Traffic) =>
    lvl === 'bad' ? 3 : lvl === 'warn' ? 2 : lvl === 'unknown' ? 1 : 0;

  const levelRankSmallBadFirst = (lvl: Traffic) =>
    lvl === 'bad' ? 0 : lvl === 'warn' ? 1 : lvl === 'good' ? 2 : 0.5;

  const getPatientThresholds = (p: PatientType): ThresholdsLike =>
    asRecord(getPatientExtra(p).thresholds) as ThresholdsLike;

  const healthMetricLevel = (
    value: number | null,
    config: {
      greenMin?: number | null;
      yellowMin?: number | null;
      greenMax?: number | null;
      yellowMax?: number | null;
      fallbackGoodMin?: number;
      fallbackWarnMin?: number;
      fallbackGoodRange?: [number, number];
      fallbackWarnRange?: [number, number];
    }
  ): Traffic => {
    if (value === null) return 'unknown';

    if (config.greenMin != null) {
      if (value >= config.greenMin) return 'good';
      if (config.yellowMin != null) {
        return value >= config.yellowMin ? 'warn' : 'bad';
      }
      const derivedWarn = Math.max(1, Math.round(config.greenMin * 0.6));
      return value >= derivedWarn ? 'warn' : 'bad';
    }

    if (config.greenMax != null) {
      if (value <= config.greenMax) return 'good';
      if (config.yellowMax != null) {
        return value <= config.yellowMax ? 'warn' : 'bad';
      }
      return 'bad';
    }

    if (config.fallbackGoodRange) {
      const [min, max] = config.fallbackGoodRange;
      if (value >= min && value <= max) return 'good';
      if (config.fallbackWarnRange) {
        const [warnMin, warnMax] = config.fallbackWarnRange;
        if (value >= warnMin && value <= warnMax) return 'warn';
      }
      return 'bad';
    }

    if (config.fallbackGoodMin != null) {
      if (value >= config.fallbackGoodMin) return 'good';
      if (config.fallbackWarnMin != null) return value >= config.fallbackWarnMin ? 'warn' : 'bad';
      return 'bad';
    }

    return 'unknown';
  };

  const healthScore = (p: PatientType) => {
    const extra = getPatientExtra(p);
    const bio = (extra.biomarker ?? extra.fitbitData) as unknown;
    const b = asRecord(bio) as BioLike;
    const thresholds = getPatientThresholds(p);

    const sleep = toNum(b.sleep_avg_h);
    const steps = toNum(b.steps_avg);
    const act = toNum(b.activity_min);
    const bpSys = toNum(b.bp_sys_avg);
    const bpDia = toNum(b.bp_dia_avg);

    let score = 0;
    let n = 0;

    const metricLevels: Traffic[] = [
      healthMetricLevel(steps, {
        greenMin: toNum(thresholds.steps_goal),
        fallbackGoodMin: 6000,
        fallbackWarnMin: 3000,
      }),
      healthMetricLevel(act, {
        greenMin: toNum(thresholds.active_minutes_green),
        yellowMin: toNum(thresholds.active_minutes_yellow),
        fallbackGoodMin: 150,
        fallbackWarnMin: 60,
      }),
      healthMetricLevel(sleep !== null ? sleep * 60 : null, {
        greenMin: toNum(thresholds.sleep_green_min),
        yellowMin: toNum(thresholds.sleep_yellow_min),
        fallbackGoodRange: [7 * 60, 9 * 60],
        fallbackWarnRange: [6 * 60, 7 * 60],
      }),
    ];

    if (bpSys !== null || bpDia !== null) {
      metricLevels.push(
        healthMetricLevel(bpSys, {
          greenMax: toNum(thresholds.bp_sys_green_max),
          yellowMax: toNum(thresholds.bp_sys_yellow_max),
        })
      );
      metricLevels.push(
        healthMetricLevel(bpDia, {
          greenMax: toNum(thresholds.bp_dia_green_max),
          yellowMax: toNum(thresholds.bp_dia_yellow_max),
        })
      );
    }

    metricLevels.forEach((level) => {
      if (level === 'unknown') return;
      n++;
      if (level === 'good') score += 2;
      else if (level === 'warn') score += 1;
    });

    return n ? score / n : -1; // 0..2; -1 unknown
  };

  const healthLevelAndTip = (p: PatientType): { level: Traffic; tip: string } => {
    const extra = getPatientExtra(p);
    const bio = (extra.biomarker ?? extra.fitbitData) as unknown;
    const b = asRecord(bio) as BioLike;
    const thresholds = getPatientThresholds(p);

    const sleep = toNum(b.sleep_avg_h);
    const steps = toNum(b.steps_avg);
    const act = toNum(b.activity_min);
    const bpSys = toNum(b.bp_sys_avg);
    const bpDia = toNum(b.bp_dia_avg);

    const score = healthScore(p);
    let level: Traffic = 'unknown';
    if (score >= 1.6) level = 'good';
    else if (score >= 0.8) level = 'warn';
    else if (score >= 0) level = 'bad';

    const parts: string[] = [];
    if (sleep != null) parts.push(`${t('Sleep')}: ${sleep.toFixed(1)}h ${t('avg (7d)')}`);
    if (steps != null)
      parts.push(`${t('Steps')}: ${Math.round(steps).toLocaleString()} ${t('avg (7d)')}`);
    if (act != null) parts.push(`${t('Activity')}: ${Math.round(act)} ${t('min avg (7d)')}`);
    if (bpSys != null && bpDia != null) {
      parts.push(
        `${t('Blood pressure')}: ${Math.round(bpSys)}/${Math.round(bpDia)} ${t('avg (7d)')}`
      );
    }
    if (toNum(thresholds.steps_goal) != null) {
      parts.push(`${t('Personalized goals')}: ${t('enabled')}`);
    }

    return { level, tip: parts.length ? parts.join(' • ') : String(t('No recent health data')) };
  };

  const wearLevelAndTip = (p: PatientType): { level: Traffic; tip: string } => {
    const extra = getPatientExtra(p);
    const bio = asRecord((extra.biomarker ?? extra.fitbitData) as unknown) as BioLike;
    const daysSinceWorn = toNum(bio.wear_time_days_since);
    const avgMin = toNum(bio.wear_time_avg_min);

    if (daysSinceWorn === null && avgMin === null) {
      return { level: 'unknown', tip: String(t('No Fitbit data')) };
    }

    let level: Traffic = 'good';
    const parts: string[] = [];

    if (daysSinceWorn !== null) {
      if (daysSinceWorn >= 2) {
        level = 'bad';
        parts.push(`${t('Not worn for')} ${daysSinceWorn} ${t('days')}`);
      } else {
        parts.push(`${t('Last worn')}: ${daysSinceWorn === 0 ? t('today') : t('yesterday')}`);
      }
    }
    if (avgMin !== null) {
      const avgH = (avgMin / 60).toFixed(1);
      parts.push(`${t('Avg wear')}: ${avgH}h ${t('(7d)')}`);
      if (level !== 'bad' && avgMin < 720) level = 'warn';
    }

    return { level, tip: parts.join(' • ') };
  };

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
    const recentDaysCount = toNum(summary.recent_days_count) ?? 0;
    const recentAvg = toNum(summary.recent_avg_score);
    const prevAvg = toNum(summary.previous_avg_score);
    const trendDelta = toNum(summary.trend_delta);
    const trendLower = summary.trend_lower === true;

    if (answeredDaysTotal > 0 && lastIso) {
      let level: Traffic = 'good';

      if (daysSinceLast != null) {
        if (daysSinceLast > 7) level = 'bad';
        else if (daysSinceLast > 3) level = 'warn';
      }

      if (recentAvg != null) {
        if (recentAvg <= 2) level = 'bad';
        else if (recentAvg < 3 && level !== 'bad') level = 'warn';
      }

      if (trendLower) {
        if (level === 'good') level = 'warn';
        else if (level === 'warn') level = 'bad';
      }

      const trendText =
        trendDelta == null
          ? String(t('n/a'))
          : trendDelta < 0
            ? `${t('lower')} (${trendDelta.toFixed(2)})`
            : trendDelta > 0
              ? `${t('higher')} (+${trendDelta.toFixed(2)})`
              : String(t('stable'));

      const parts: string[] = [
        `${t('Last intervention feedback')}: ${fmtDateTime(lastIso)}${daysSinceLast != null ? ` (${daysSinceLast} ${t('days ago')})` : ''}`,
      ];
      if (recentAvg != null) {
        parts.push(
          `${t('Avg score')} (${t('last')} ${recentDaysCount} ${t('answered days')}): ${recentAvg.toFixed(2)}`
        );
      }
      if (prevAvg != null) parts.push(`${t('Previous avg score')}: ${prevAvg.toFixed(2)}`);
      parts.push(`${t('Trend')}: ${trendText}`);

      return { level, tip: parts.join(' • ') };
    }

    // Fallback when intervention feedback has no numeric scored entries yet
    const last = getIsoMaybe(extra.last_feedback_at);
    const d = daysSince(last || undefined);
    let level: Traffic = 'unknown';
    if (!last || d === Number.POSITIVE_INFINITY) level = 'warn';
    else if (d <= 14) level = 'good';
    else if (d <= 30) level = 'warn';
    else level = 'bad';
    return {
      level,
      tip: last
        ? `${t('Last feedback')}: ${fmtDateTime(last)} (${d} ${t('days ago')})`
        : String(t('No recent feedback')),
    };
  };

  const shouldHideHealthChip = (p: PatientType): boolean => !store.isCompletedPatient(p);

  const ampelComposite = (p: PatientType) => {
    const l = loginLevelAndTip(p);
    const a = adherenceLevelAndTip(p);
    const h = healthLevelAndTip(p);
    const f = feedbackLevelAndTip(p);
    const includeHealth = !shouldHideHealthChip(p);

    const base = levelToNum(l.level) + levelToNum(a.level) + levelToNum(f.level);
    const baseWithHealth = includeHealth ? base + levelToNum(h.level) : base;

    const extra = getPatientExtra(p);
    const lastLogin =
      getIsoMaybe(extra.last_online) ||
      getIsoMaybe(extra.user_last_login) ||
      getIsoMaybe(extra.last_login) ||
      '';
    const dLogin = daysSince(lastLogin);

    const adh = toNum(extra.adherence_rate) ?? -1;
    const hScore = healthScore(p);

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
    const healthTweak = includeHealth ? (hScore >= 0 ? (2 - hScore) / 2 : 0.5) : 0;

    return baseWithHealth + tweak + healthTweak;
  };

  const renderStatusChips = (p: PatientType) => {
    const login = loginLevelAndTip(p);
    const adh = adherenceLevelAndTip(p);
    const health = healthLevelAndTip(p);
    const fb = feedbackLevelAndTip(p);
    const wear = wearLevelAndTip(p);
    const hideHealthChip = shouldHideHealthChip(p);

    const Chip = ({ label, level, tip }: { label: string; level: Traffic; tip: string }) => (
      <OverlayTrigger
        placement="top"
        overlay={
          <Tooltip>
            <div style={{ whiteSpace: 'pre-line' }}>{tip}</div>
          </Tooltip>
        }
      >
        <span
          className={`status-chip ${chipClass(level)}`}
          role="img"
          aria-label={`${label} ${level}`}
        >
          {label}
        </span>
      </OverlayTrigger>
    );

    return (
      <div className="status-stack">
        <Chip label={String(t('Login'))} level={login.level} tip={login.tip} />
        <Chip label={String(t('Adherence'))} level={adh.level} tip={adh.tip} />
        {!hideHealthChip && (
          <Chip label={String(t('Health'))} level={health.level} tip={health.tip} />
        )}
        <Chip label={String(t('Feedback'))} level={fb.level} tip={fb.tip} />
        {wear.level !== 'unknown' && (
          <Chip label={String(t('Wear'))} level={wear.level} tip={wear.tip} />
        )}
      </div>
    );
  };

  // ===== Sorting (includes ampel) =====
  const sortedFiltered = useMemo(() => {
    const arr = [...store.filteredPatients];

    const getHealth = (p: PatientType) => healthScore(p);
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

    arr.sort((a, b) => {
      switch (store.sortBy) {
        case 'ampel':
          return ampelComposite(b) - ampelComposite(a);
        case 'last_login':
          return getLogin(a) - getLogin(b); // smaller = more recent
        case 'adherence':
          return getAdh(b) - getAdh(a);
        case 'health':
          return getHealth(a) - getHealth(b); // smaller score = worse
        case 'feedback':
          return getFb(a) - getFb(b);
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
  }, [store.filteredPatients, store.sortBy]);

  const { active: activePatients, completed: completedPatients } = useMemo(
    () => store.splitCompleted(sortedFiltered),
    [store, sortedFiltered]
  );

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container className="main-content mt-4">
        <WelcomeArea user="Therapist" />

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
            <Button onClick={store.openAddPatient} disabled={store.loading}>
              {String(t('Add a New Patient'))}
            </Button>

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
                  <option value="last_login">{String(t('Last login (recent first)'))}</option>
                  <option value="adherence">{String(t('Adherence (high → low)'))}</option>
                  <option value="health">{String(t('Health (best → worst)'))}</option>
                  <option value="feedback">{String(t('Feedback (worst → best)'))}</option>
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

        <Table responsive hover className="align-middle">
          <thead>
            <tr>
              <th>{String(t('Patient ID'))}</th>
              <th>{String(t('Full Name'))}</th>
              <th>{String(t('Birth Date'))}</th>
              <th>{String(t('Sex'))}</th>
              <th>{String(t('Diagnosis_patient_list'))}</th>
              <th>{String(t('Status'))}</th>
              <th className="text-end">{String(t('Actions'))}</th>
            </tr>
          </thead>
          <tbody>
            {activePatients.map((p) => {
              const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
              const diagnosis = Array.isArray(p.diagnosis)
                ? p.diagnosis.join(', ')
                : String(p.diagnosis || '');
              const patientId = getPatientIdStr(p);
              const mongoId = getPatientMongoId(p);

              return (
                <tr key={mongoId || patientId}>
                  <td style={{ whiteSpace: 'nowrap' }}>{patientId}</td>
                  <td>{fullName}</td>
                  <td>{fmtDate(String(p.age || ''))}</td>
                  <td>{String(t(p.sex))}</td>
                  <td style={{ minWidth: 200 }}>{diagnosis}</td>
                  <td style={{ minWidth: 220 }}>{renderStatusChips(p)}</td>
                  <td className="text-end">
                    <div className="d-flex justify-content-end gap-2 flex-wrap">
                      <Button size="sm" variant="success" onClick={() => store.openPatient(p)}>
                        {String(t('Info'))}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleRehabButton(mongoId, fullName)}
                      >
                        {String(t('Rehabilitation Plan'))}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => handleProgressButton(mongoId, fullName)}
                      >
                        {String(t('Outcomes Dashboard'))}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {activePatients.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  {store.loading
                    ? String(t('Loading patients...'))
                    : String(t('No active patients'))}
                </td>
              </tr>
            )}
          </tbody>
        </Table>

        <Collapse in={store.showCompleted}>
          <div>
            <h5 className="mt-4 mb-2">
              {String(t('Completed'))} ({completedPatients.length})
            </h5>

            <Table responsive hover className="align-middle">
              <thead>
                <tr>
                  <th>{String(t('Patient ID'))}</th>
                  <th>{String(t('Full Name'))}</th>
                  <th>{String(t('Birth Date'))}</th>
                  <th>{String(t('Sex'))}</th>
                  <th>{String(t('Diagnosis'))}</th>
                  <th>{String(t('Status'))}</th>
                  <th className="text-end">{String(t('Actions'))}</th>
                </tr>
              </thead>
              <tbody>
                {completedPatients.map((p) => {
                  const fullName = `${p.first_name || ''} ${p.name || ''}`.trim();
                  const diagnosis = Array.isArray(p.diagnosis)
                    ? p.diagnosis.join(', ')
                    : String(p.diagnosis || '');
                  const extra = getPatientExtra(p);
                  const endDate = getIsoMaybe(extra.rehab_end_date);
                  const patientId = getPatientIdStr(p);
                  const mongoId = getPatientMongoId(p);

                  return (
                    <tr key={mongoId || patientId} className="completed-row">
                      <td style={{ whiteSpace: 'nowrap' }}>{patientId}</td>
                      <td>
                        {fullName}{' '}
                        <Badge bg="success" className="ms-2">
                          {String(t('Completed'))}
                        </Badge>
                        {endDate && (
                          <small className="text-muted ms-2">
                            {String(t('Discharged'))}: {fmtDate(endDate)}
                          </small>
                        )}
                      </td>
                      <td>{fmtDate(String(p.age || ''))}</td>
                      <td>{String(t(p.sex))}</td>
                      <td style={{ minWidth: 200 }}>{diagnosis}</td>
                      <td style={{ minWidth: 220 }}>{renderStatusChips(p)}</td>
                      <td className="text-end">
                        <div className="d-flex justify-content-end gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => store.openPatient(p)}
                          >
                            {String(t('Info'))}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            onClick={() => handleProgressButton(mongoId, fullName)}
                          >
                            {String(t('Outcomes Dashboard'))}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {completedPatients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      {String(t('No completed patients'))}
                    </td>
                  </tr>
                )}
              </tbody>
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

      <AddPatientPopup show={store.showAddPatientPopup} handleClose={handleCloseAdd} />

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

      <Footer />

      <style>{`
        .status-stack { display: flex; flex-direction: column; gap: 6px; }
        .status-chip {
          display: inline-block;
          padding: .25rem .5rem;
          border-radius: .5rem;
          font-size: .8rem;
          font-weight: 600;
          line-height: 1;
          width: fit-content;
        }
        .completed-row { opacity: .85; }
        .completed-row td:first-child { color: #555; }
      `}</style>
    </div>
  );
});

export default Therapist;
