// src/utils/patientStatus.ts
import type { PatientType } from '@/types';
import { formatLocaleDate, formatLocaleDateTime } from '@/utils/dateFormat';

export type Traffic = 'good' | 'warn' | 'bad' | 'unknown';

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

  biomarker?: unknown;
  fitbitData?: unknown;
  wearable_device?: unknown;
};

type BioLike = {
  wear_time_avg_min?: unknown;
  wear_time_days_since?: unknown;
  fitbit_revoked?: unknown;
  fitbit_no_token?: unknown;
};

export const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const getPatientExtra = (p: PatientType): PatientExtra => p as unknown as PatientExtra;

export const getPatientIdStr = (p: PatientType): string => {
  const x = getPatientExtra(p);
  const code = typeof x.patient_code === 'string' ? x.patient_code : '';
  const uname = typeof x.username === 'string' ? x.username : '';
  const id = typeof x._id === 'string' ? x._id : '';
  return code || uname || (id ? id.slice(-8) : '') || '—';
};

export const getPatientMongoId = (p: PatientType): string => {
  const x = getPatientExtra(p);
  return typeof x._id === 'string' ? x._id : '';
};

export const getIsoMaybe = (v: unknown): string => (typeof v === 'string' ? v : '');

export const fmtDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatLocaleDate(d);
};

export const daysSince = (iso?: string) => {
  if (!iso) return Number.POSITIVE_INFINITY;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
};

export const fmtDateTime = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return formatLocaleDateTime(d);
};

export const chipClass = (level: Traffic) => {
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

export const levelToNum = (lvl: Traffic) =>
  lvl === 'bad' ? 3 : lvl === 'warn' ? 2 : lvl === 'unknown' ? 1 : 0;

export const levelRankSmallBadFirst = (lvl: Traffic) =>
  lvl === 'bad' ? 0 : lvl === 'warn' ? 1 : lvl === 'good' ? 2 : 0.5;

const getLastLoginIso = (p: PatientType): string => {
  const extra = getPatientExtra(p);
  return (
    getIsoMaybe(extra.last_online) ||
    getIsoMaybe(extra.user_last_login) ||
    getIsoMaybe(extra.last_login) ||
    ''
  );
};

export const loginLevel = (p: PatientType): Traffic => {
  const d = daysSince(getLastLoginIso(p));

  if (d === Number.POSITIVE_INFINITY) return 'unknown';
  if (d <= 3) return 'good';
  if (d <= 7) return 'warn';
  return 'bad';
};

export const adherenceLevel = (p: PatientType): Traffic => {
  const rate = toNum(getPatientExtra(p).adherence_rate);
  if (typeof rate !== 'number') return 'unknown';
  if (rate >= 80) return 'good';
  if (rate >= 50) return 'warn';
  return 'bad';
};

export const feedbackLevel = (p: PatientType): Traffic => {
  const extra = getPatientExtra(p);
  const summary = asRecord(extra.intervention_feedback) as InterventionFeedbackLike;

  const lastIso = getIsoMaybe(summary.last_answered_at);
  const daysSinceLast = toNum(summary.days_since_last);
  const answeredDaysTotal = toNum(summary.answered_days_total) ?? 0;
  const lowRatings14d = toNum(summary.low_ratings_14d) ?? 0;

  if (answeredDaysTotal === 0 || !lastIso) return 'unknown';
  // Red: no rating for >30 days OR ≥7 low ratings (≤2★) in last 14 days
  if ((daysSinceLast != null && daysSinceLast > 30) || lowRatings14d >= 7) return 'bad';
  // Yellow: no rating for 15–30 days OR ≥3 low ratings in last 14 days
  if ((daysSinceLast != null && daysSinceLast > 14) || lowRatings14d >= 3) return 'warn';
  return 'good';
};

export const ampelComposite = (p: PatientType) => {
  const base =
    levelToNum(loginLevel(p)) + levelToNum(adherenceLevel(p)) + levelToNum(feedbackLevel(p));

  const extra = getPatientExtra(p);
  const dLogin = daysSince(getLastLoginIso(p));

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

export const getLoginInfo = (p: PatientType) => {
  const last = getLastLoginIso(p);
  return { last, days: daysSince(last), level: loginLevel(p) };
};

export const getAdherenceInfo = (p: PatientType) => {
  const rate = toNum(getPatientExtra(p).adherence_rate);
  return { rate, level: adherenceLevel(p) };
};

export const getFeedbackInfo = (p: PatientType) => {
  const extra = getPatientExtra(p);
  const summary = asRecord(extra.intervention_feedback) as InterventionFeedbackLike;
  return {
    lastAnsweredAt: getIsoMaybe(summary.last_answered_at),
    daysSinceLast: toNum(summary.days_since_last),
    lowRatings14d: toNum(summary.low_ratings_14d) ?? 0,
    level: feedbackLevel(p),
  };
};

const getBio = (p: PatientType): BioLike => {
  const extra = getPatientExtra(p);
  return asRecord(extra.biomarker ?? extra.fitbitData) as BioLike;
};

export const getWearInfo = (p: PatientType) => {
  const device = String((p as any).wearable_device ?? 'fitbit') as 'fitbit' | 'omron' | 'none';

  if (device === 'omron' || device === 'none') {
    return {
      level: 'unknown' as Traffic,
      daysSinceWorn: null,
      avgMin: null,
      revoked: false,
      device,
    };
  }

  const b = getBio(p);
  const daysSinceWorn = toNum(b.wear_time_days_since);
  const avgMin = toNum(b.wear_time_avg_min);
  const revoked = b.fitbit_revoked === true || b.fitbit_no_token === true;

  if (revoked) {
    return { level: 'bad' as Traffic, daysSinceWorn, avgMin, revoked: true, device };
  }

  if (daysSinceWorn === null && avgMin === null) {
    return { level: 'unknown' as Traffic, daysSinceWorn, avgMin, revoked: false, device };
  }

  let level: Traffic = 'good';
  if (daysSinceWorn !== null && daysSinceWorn >= 2) {
    level = 'bad';
  }
  if (level !== 'bad' && avgMin !== null && avgMin < 720) {
    level = 'warn';
  }

  return { level, daysSinceWorn, avgMin, revoked: false, device };
};
