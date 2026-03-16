import { useEffect, useMemo, useState } from 'react';
import apiClient from '@/api/client';
import { usePatientAuthGate } from '@/hooks/usePatientAuthGate';
import authStore from '@/stores/authStore';

export type ProcessFilter = 'week' | 'month';
export type BarMetricKey = 'steps' | 'activeMinutes' | 'sleepMinutes';

export type CombinedHealthResponse = {
  fitbit?: unknown[];
  questionnaire?: unknown[];
  adherence?: unknown[];
};

export type ThresholdsResponse = {
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

export type DailyMetricsDatum = {
  date: string;
  steps: number;
  activeMinutes: number;
  sleepMinutes: number;
  bpSys: number | null;
  bpDia: number | null;
};

export type ThresholdStatus = {
  steps: boolean | null;
  activeMinutes: boolean | null;
  sleepMinutes: boolean | null;
  bloodPressure: boolean | null;
};

type AverageMetrics = {
  steps: number | null;
  activeMinutes: number | null;
  activeMinutesLabel: string | null;
  sleepMinutes: number | null;
  sleepMinutesLabel: string | null;
  bpSys: number | null;
  bpDia: number | null;
  recommendationsPct: number | null;
};

type ChartThresholds = {
  steps: number | null;
  activeMinutes: number | null;
  sleepMinutes: number | null;
  bpSysMax: number | null;
  bpDiaMax: number | null;
};

type ChartYMax = {
  steps: number;
  activeMinutes: number;
  sleepMinutes: number;
  bloodPressure: number;
};

const toISODate = (date: Date) => date.toISOString().slice(0, 10);

const asNumberOrNull = (value: unknown) => {
  if (value == null) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const averageOf = (values: number[]) =>
  values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : null;

const formatMinutesToHM = (minutes: number | null) => {
  if (minutes === null) return null;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};

const getDateWindow = (filter: ProcessFilter) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (filter === 'week' ? 7 : 30));

  return { from: toISODate(from), to: toISODate(to) };
};

export function usePatientProcess() {
  const { isAllowed } = usePatientAuthGate();

  const [processFilter, setProcessFilter] = useState<ProcessFilter>('week');
  const [combinedHistory, setCombinedHistory] = useState<CombinedHealthResponse | null>(null);
  const [combinedHistoryLoading, setCombinedHistoryLoading] = useState(false);
  const [combinedHistoryError, setCombinedHistoryError] = useState('');
  const [thresholds, setThresholds] = useState<ThresholdsResponse | null>(null);

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const { from, to } = useMemo(() => getDateWindow(processFilter), [processFilter]);

  useEffect(() => {
    let alive = true;

    const loadCombinedHistory = async () => {
      if (!patientId || !isAllowed) return;

      setCombinedHistoryLoading(true);
      setCombinedHistoryError('');

      try {
        const res = await apiClient.get<CombinedHealthResponse>(
          `/patients/health-combined-history/${patientId}/`,
          { params: { from, to } }
        );

        if (!alive) return;
        setCombinedHistory(res?.data || {});
      } catch (err: unknown) {
        const errObj = err as {
          response?: { data?: { error?: string; message?: string; detail?: string } };
        };
        const msg = errObj?.response?.data;

        if (!alive) return;
        setCombinedHistory(null);
        setCombinedHistoryError(
          String(msg?.error || msg?.message || msg?.detail || 'Request failed')
        );
      } finally {
        if (alive) setCombinedHistoryLoading(false);
      }
    };

    void loadCombinedHistory();

    return () => {
      alive = false;
    };
  }, [patientId, isAllowed, from, to]);

  useEffect(() => {
    let alive = true;

    const loadThresholds = async () => {
      if (!patientId || !isAllowed) return;

      try {
        const res = await apiClient.get<{ thresholds?: ThresholdsResponse }>(
          `/patients/${patientId}/thresholds/`
        );
        if (!alive) return;
        setThresholds(res?.data?.thresholds || {});
      } catch {
        if (!alive) return;
        setThresholds(null);
      }
    };

    void loadThresholds();

    return () => {
      alive = false;
    };
  }, [patientId, isAllowed]);

  const dailyMetrics = useMemo<DailyMetricsDatum[]>(() => {
    const byDay = new Map<string, Omit<DailyMetricsDatum, 'date'>>();

    if (Array.isArray(combinedHistory?.fitbit)) {
      combinedHistory.fitbit.forEach((item) => {
        if (!item || typeof item !== 'object') return;

        const row = item as {
          date?: unknown;
          steps?: unknown;
          active_minutes?: unknown;
          sleep?: { sleep_duration?: unknown };
          bp_sys?: unknown;
          bp_dia?: unknown;
        };

        const dayKey = typeof row.date === 'string' ? row.date.slice(0, 10) : '';
        if (!dayKey) return;

        const parsedSteps = Number(row.steps ?? NaN);
        const parsedActiveMinutes = Number(row.active_minutes ?? NaN);
        const parsedSleepDuration = Number(row.sleep?.sleep_duration ?? NaN);
        const parsedBpSys = Number(row.bp_sys ?? NaN);
        const parsedBpDia = Number(row.bp_dia ?? NaN);

        const sleepMinutes = Number.isFinite(parsedSleepDuration)
          ? parsedSleepDuration > 2000
            ? parsedSleepDuration / 60000
            : parsedSleepDuration
          : 0;

        byDay.set(dayKey, {
          steps: Number.isFinite(parsedSteps) ? Math.max(0, Math.round(parsedSteps)) : 0,
          activeMinutes: Number.isFinite(parsedActiveMinutes)
            ? Math.max(0, Math.round(parsedActiveMinutes))
            : 0,
          sleepMinutes: Math.max(0, Math.round(sleepMinutes)),
          bpSys: Number.isFinite(parsedBpSys) ? Math.round(parsedBpSys) : null,
          bpDia: Number.isFinite(parsedBpDia) ? Math.round(parsedBpDia) : null,
        });
      });
    }

    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

    const series: DailyMetricsDatum[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const dayKey = cursor.toISOString().slice(0, 10);
      const metrics = byDay.get(dayKey);
      series.push({
        date: dayKey.slice(5),
        steps: metrics?.steps ?? 0,
        activeMinutes: metrics?.activeMinutes ?? 0,
        sleepMinutes: metrics?.sleepMinutes ?? 0,
        bpSys: metrics?.bpSys ?? null,
        bpDia: metrics?.bpDia ?? null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return series;
  }, [combinedHistory?.fitbit, from, to]);

  const adherenceTotals = useMemo(() => {
    let completed = 0;
    let scheduled = 0;

    if (Array.isArray(combinedHistory?.adherence)) {
      combinedHistory.adherence.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const row = item as { scheduled?: unknown; completed?: unknown };
        scheduled += Number(row.scheduled) || 0;
        completed += Number(row.completed) || 0;
      });
    }

    return { completed, uncompleted: Math.max(0, scheduled - completed) };
  }, [combinedHistory?.adherence]);

  const averageMetrics = useMemo<AverageMetrics>(() => {
    const withSteps = dailyMetrics.filter((entry) => entry.steps > 0);
    const withActive = dailyMetrics.filter((entry) => entry.activeMinutes > 0);
    const withSleep = dailyMetrics.filter((entry) => entry.sleepMinutes > 0);
    const withBpSys = dailyMetrics.filter((entry) => entry.bpSys !== null);
    const withBpDia = dailyMetrics.filter((entry) => entry.bpDia !== null);
    const adherenceTotal = adherenceTotals.completed + adherenceTotals.uncompleted;

    const averageActiveMinutes = averageOf(withActive.map((entry) => entry.activeMinutes));
    const averageSleepMinutes = averageOf(withSleep.map((entry) => entry.sleepMinutes));

    return {
      steps: averageOf(withSteps.map((entry) => entry.steps)),
      activeMinutes: averageActiveMinutes,
      activeMinutesLabel: formatMinutesToHM(averageActiveMinutes),
      sleepMinutes: averageSleepMinutes,
      sleepMinutesLabel: formatMinutesToHM(averageSleepMinutes),
      bpSys: averageOf(withBpSys.map((entry) => entry.bpSys as number)),
      bpDia: averageOf(withBpDia.map((entry) => entry.bpDia as number)),
      recommendationsPct:
        adherenceTotal > 0 ? Math.round((adherenceTotals.completed / adherenceTotal) * 100) : null,
    };
  }, [dailyMetrics, adherenceTotals]);

  const chartThresholds = useMemo<ChartThresholds>(() => {
    return {
      steps: asNumberOrNull(thresholds?.steps_goal),
      activeMinutes: asNumberOrNull(thresholds?.active_minutes_green),
      sleepMinutes: asNumberOrNull(thresholds?.sleep_green_min),
      bpSysMax: asNumberOrNull(thresholds?.bp_sys_green_max),
      bpDiaMax: asNumberOrNull(thresholds?.bp_dia_green_max),
    };
  }, [thresholds]);

  const chartYMax = useMemo<ChartYMax>(() => {
    const withPadding = (value: number) => Math.max(1, Math.ceil(value * 1.1));

    const maxSteps = Math.max(
      ...dailyMetrics.map((entry) => entry.steps),
      chartThresholds.steps ?? 0,
      0
    );
    const maxActiveMinutes = Math.max(
      ...dailyMetrics.map((entry) => entry.activeMinutes),
      chartThresholds.activeMinutes ?? 0,
      0
    );
    const maxSleepMinutes = Math.max(
      ...dailyMetrics.map((entry) => entry.sleepMinutes),
      chartThresholds.sleepMinutes ?? 0,
      0
    );
    const maxBloodPressure = Math.max(
      ...dailyMetrics.flatMap((entry) => [entry.bpSys ?? 0, entry.bpDia ?? 0]),
      chartThresholds.bpSysMax ?? 0,
      chartThresholds.bpDiaMax ?? 0,
      0
    );

    return {
      steps: withPadding(maxSteps),
      activeMinutes: withPadding(maxActiveMinutes),
      sleepMinutes: withPadding(maxSleepMinutes),
      bloodPressure: withPadding(maxBloodPressure),
    };
  }, [dailyMetrics, chartThresholds]);

  const thresholdStatus = useMemo<ThresholdStatus>(() => {
    const isReached = (value: number | null, threshold: number | null) =>
      value !== null && threshold !== null && value >= threshold;

    return {
      steps:
        chartThresholds.steps !== null
          ? isReached(averageMetrics.steps, chartThresholds.steps)
          : null,
      activeMinutes:
        chartThresholds.activeMinutes !== null
          ? isReached(averageMetrics.activeMinutes, chartThresholds.activeMinutes)
          : null,
      sleepMinutes:
        chartThresholds.sleepMinutes !== null
          ? isReached(averageMetrics.sleepMinutes, chartThresholds.sleepMinutes)
          : null,
      bloodPressure:
        chartThresholds.bpSysMax !== null && chartThresholds.bpDiaMax !== null
          ? averageMetrics.bpSys !== null &&
            averageMetrics.bpDia !== null &&
            averageMetrics.bpSys <= chartThresholds.bpSysMax &&
            averageMetrics.bpDia <= chartThresholds.bpDiaMax
          : null,
    };
  }, [averageMetrics, chartThresholds]);

  return {
    processFilter,
    setProcessFilter,
    from,
    to,
    combinedHistory,
    combinedHistoryLoading,
    combinedHistoryError,
    dailyMetrics,
    adherenceTotals,
    averageMetrics,
    chartThresholds,
    chartYMax,
    thresholdStatus,
  };
}
