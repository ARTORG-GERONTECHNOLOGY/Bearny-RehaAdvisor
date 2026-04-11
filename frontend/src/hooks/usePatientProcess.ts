import { useEffect, useMemo, useState } from 'react';
import { usePatientAuthGate } from '@/hooks/usePatientAuthGate';
import authStore from '@/stores/authStore';
import { healthPageStore } from '@/stores/healthPageStore';
import { patientFitbitStore } from '@/stores/patientFitbitStore';

export type ProcessFilter = 'week' | 'month';
export type BarMetricKey = 'steps' | 'activeMinutes' | 'sleepMinutes';

export type CombinedHealthResponse = {
  adherence?: AdherenceItem[];
};

type AdherenceItem = {
  scheduled?: unknown;
  completed?: unknown;
  date?: unknown;
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

type FitbitPeriodAverages = {
  steps?: unknown;
  active_minutes?: unknown;
  sleep_minutes?: unknown;
  bp_sys?: unknown;
  bp_dia?: unknown;
};

type FitbitPeriodDaily = {
  date?: unknown;
  steps?: unknown;
  active_minutes?: unknown;
  sleep_minutes?: unknown;
  bp_sys?: unknown;
  bp_dia?: unknown;
};

type FitbitSummaryResponse = {
  thresholds?: ThresholdsResponse;
  period?: {
    days?: unknown;
    averages?: FitbitPeriodAverages;
    daily?: FitbitPeriodDaily[];
  };
};

export type DailyMetricsDatum = {
  date: string;
  steps: number;
  activeMinutes: number;
  sleepMinutes: number;
  bpSys: number | null;
  bpDia: number | null;
};

export type IsReachedStatus = {
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

const asPositiveNumberOrNull = (value: unknown) => {
  const numericValue = asNumberOrNull(value);
  return numericValue !== null && numericValue > 0 ? numericValue : null;
};

const formatMinutesToHM = (minutes: number | null) => {
  if (minutes === null) return null;
  const totalMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return `${hours}h ${remainingMinutes}min`;
};

export const getDateWindow = (filter: ProcessFilter) => {
  const days = filter === 'week' ? 7 : 30;
  const to = new Date();
  const from = new Date(to);
  // Range is inclusive of both `from` and `to`, so subtract days - 1.
  from.setDate(to.getDate() - (days - 1));

  return { from: toISODate(from), to: toISODate(to) };
};

export function usePatientProcess() {
  const { isAllowed } = usePatientAuthGate();

  const [processFilter, setProcessFilter] = useState<ProcessFilter>('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [adherenceItems, setAdherenceItems] = useState<AdherenceItem[]>([]);
  const [fitbitSummary, setFitbitSummary] = useState<FitbitSummaryResponse | null>(null);
  const [thresholds, setThresholds] = useState<ThresholdsResponse | null>(null);

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const { from, to } = useMemo(() => getDateWindow(processFilter), [processFilter]);
  const days = processFilter === 'week' ? 7 : 30;

  useEffect(() => {
    let alive = true;

    const loadData = async () => {
      if (!patientId || !isAllowed) return;
      setLoading(true);
      setError('');

      // Fire both fetches
      const healthPromise = healthPageStore.fetchCombinedHistoryForPatient(patientId, from, to);
      const fitbitPromise = patientFitbitStore.fetchSummary(patientId, days);

      // Seed state from cache while fetches are in-flight
      const cachedAdherence = healthPageStore.adherenceData;
      const cachedFitbit =
        patientFitbitStore.summary?.period?.days === days ? patientFitbitStore.summary : null;
      const hasCachedData = cachedAdherence.length > 0 || !!cachedFitbit;

      if (cachedAdherence.length > 0) {
        setAdherenceItems(cachedAdherence as AdherenceItem[]);
      }
      if (cachedFitbit) {
        setFitbitSummary(cachedFitbit as FitbitSummaryResponse | null);
        setThresholds((cachedFitbit.thresholds ?? null) as ThresholdsResponse | null);
      }
      setLoading(cachedAdherence.length === 0 || !cachedFitbit);

      try {
        await Promise.all([healthPromise, fitbitPromise]);
        if (!alive) return;

        const storeError = healthPageStore.error || patientFitbitStore.error;
        if (storeError) throw storeError;

        setAdherenceItems(healthPageStore.adherenceData);
        setFitbitSummary(patientFitbitStore.summary as FitbitSummaryResponse | null);
        setThresholds(
          (patientFitbitStore.summary?.thresholds ?? null) as ThresholdsResponse | null
        );
      } catch {
        if (!alive) return;
        if (!hasCachedData) {
          setAdherenceItems([]);
          setFitbitSummary(null);
          setThresholds(null);
        }
        setError(healthPageStore.error || patientFitbitStore.error || 'Request failed');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadData();

    return () => {
      alive = false;
    };
  }, [patientId, isAllowed, from, to, processFilter]);

  const dailyMetrics = useMemo<DailyMetricsDatum[]>(() => {
    const byDay = new Map<string, Omit<DailyMetricsDatum, 'date'>>();

    if (Array.isArray(fitbitSummary?.period?.daily)) {
      fitbitSummary.period.daily.forEach((row) => {
        const dayKey = typeof row.date === 'string' ? row.date.slice(0, 10) : '';
        if (!dayKey) return;

        const steps = asNumberOrNull(row.steps);
        const activeMinutes = asNumberOrNull(row.active_minutes);
        const sleepMinutes = asNumberOrNull(row.sleep_minutes);
        const bpSys = asNumberOrNull(row.bp_sys);
        const bpDia = asNumberOrNull(row.bp_dia);

        byDay.set(dayKey, {
          steps: steps !== null ? Math.max(0, Math.round(steps)) : 0,
          activeMinutes: activeMinutes !== null ? Math.max(0, Math.round(activeMinutes)) : 0,
          sleepMinutes: sleepMinutes !== null ? Math.max(0, Math.round(sleepMinutes)) : 0,
          bpSys: bpSys !== null ? Math.round(bpSys) : null,
          bpDia: bpDia !== null ? Math.round(bpDia) : null,
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
  }, [fitbitSummary?.period?.daily, from, to]);

  const adherenceTotals = useMemo(() => {
    let completed = 0;
    let scheduled = 0;

    adherenceItems.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const row = item as AdherenceItem;
      scheduled += Number(row.scheduled) || 0;
      completed += Number(row.completed) || 0;
    });

    return { completed, uncompleted: Math.max(0, scheduled - completed) };
  }, [adherenceItems]);

  const averageMetrics = useMemo<AverageMetrics>(() => {
    const averages = fitbitSummary?.period?.averages;
    const adherenceTotal = adherenceTotals.completed + adherenceTotals.uncompleted;

    const averageSteps = asPositiveNumberOrNull(averages?.steps);
    const averageActiveMinutes = asPositiveNumberOrNull(averages?.active_minutes);
    const averageSleepMinutes = asPositiveNumberOrNull(averages?.sleep_minutes);
    const averageBpSys = asPositiveNumberOrNull(averages?.bp_sys);
    const averageBpDia = asPositiveNumberOrNull(averages?.bp_dia);

    return {
      steps: averageSteps !== null ? Math.round(averageSteps) : null,
      activeMinutes: averageActiveMinutes,
      activeMinutesLabel: formatMinutesToHM(averageActiveMinutes),
      sleepMinutes: averageSleepMinutes,
      sleepMinutesLabel: formatMinutesToHM(averageSleepMinutes),
      bpSys: averageBpSys !== null ? Math.round(averageBpSys) : null,
      bpDia: averageBpDia !== null ? Math.round(averageBpDia) : null,
      recommendationsPct:
        adherenceTotal > 0 ? Math.round((adherenceTotals.completed / adherenceTotal) * 100) : null,
    };
  }, [fitbitSummary?.period?.averages, adherenceTotals]);

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

  const isReachedStatus = useMemo<IsReachedStatus>(() => {
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
    loading,
    error,
    dailyMetrics,
    adherenceTotals,
    averageMetrics,
    chartThresholds,
    chartYMax,
    isReachedStatus,
  };
}
