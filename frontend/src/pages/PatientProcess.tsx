import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import authStore from '@/stores/authStore';
import apiClient from '@/api/client';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
import { format } from 'date-fns';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CircleXFill from '@/assets/icons/circle-xmark-fill.svg?react';
import PatientProcessSkeleton from '@/components/skeletons/PatientProcessSkeleton';

type ProcessFilter = 'week' | 'month';

type CombinedHealthResponse = {
  fitbit?: unknown[];
  questionnaire?: unknown[];
  adherence?: unknown[];
};

type ThresholdsResponse = {
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

type DailyMetricsDatum = {
  date: string;
  steps: number;
  activeMinutes: number;
  sleepMinutes: number;
  bpSys: number | null;
  bpDia: number | null;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const getDateWindow = (filter: ProcessFilter) => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - (filter === 'week' ? 7 : 30));

  return { from: toISODate(from), to: toISODate(to) };
};

const PatientProcess: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const recommendationsChartConfig = {
    completed: { label: t('Completed') },
    uncompleted: { label: t('Uncompleted') },
  } satisfies ChartConfig;
  const stepsChartConfig = {
    steps: { label: t('Steps') },
  } satisfies ChartConfig;
  const activeMinutesChartConfig = {
    activeMinutes: { label: t('Active Minutes') },
  } satisfies ChartConfig;
  const sleepChartConfig = {
    sleepMinutes: { label: t('Sleep (min)') },
  } satisfies ChartConfig;
  const bloodPressureChartConfig = {
    bpSys: { label: t('Blood pressure systolic') },
    bpDia: { label: t('Blood pressure diastolic') },
  } satisfies ChartConfig;

  const [processFilter, setProcessFilter] = React.useState<ProcessFilter>('week');
  const [combinedHistory, setCombinedHistory] = React.useState<CombinedHealthResponse | null>(null);
  const [combinedHistoryLoading, setCombinedHistoryLoading] = React.useState(false);
  const [combinedHistoryError, setCombinedHistoryError] = React.useState('');
  const [thresholds, setThresholds] = React.useState<ThresholdsResponse | null>(null);

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const { from, to } = getDateWindow(processFilter);

  const filterOptions: { value: ProcessFilter; label: string }[] = [
    { value: 'week', label: t('Last Week') },
    { value: 'month', label: t('Last Month') },
  ];

  useEffect(() => {
    let alive = true;

    const checkAuth = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;
      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
      }
    };

    checkAuth();

    return () => {
      alive = false;
    };
  }, [navigate]);

  useEffect(() => {
    let alive = true;

    const loadCombinedHistory = async () => {
      if (!patientId || !authStore.isAuthenticated || authStore.userType !== 'Patient') return;

      const { from, to } = getDateWindow(processFilter);

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
          String(msg?.error || msg?.message || msg?.detail || t('Failed to load health data.'))
        );
      } finally {
        if (alive) setCombinedHistoryLoading(false);
      }
    };

    void loadCombinedHistory();

    return () => {
      alive = false;
    };
  }, [patientId, processFilter, t, authStore.isAuthenticated, authStore.userType]);

  useEffect(() => {
    let alive = true;

    const loadThresholds = async () => {
      if (!patientId || !authStore.isAuthenticated || authStore.userType !== 'Patient') return;

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
  }, [patientId, authStore.isAuthenticated, authStore.userType]);

  const dailyMetrics = React.useMemo<DailyMetricsDatum[]>(() => {
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

  const adherenceTotals = React.useMemo(() => {
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

  const averageMetrics = React.useMemo(() => {
    const withSteps = dailyMetrics.filter((d) => d.steps > 0);
    const withActive = dailyMetrics.filter((d) => d.activeMinutes > 0);
    const withSleep = dailyMetrics.filter((d) => d.sleepMinutes > 0);
    const withBpSys = dailyMetrics.filter((d) => d.bpSys !== null);
    const withBpDia = dailyMetrics.filter((d) => d.bpDia !== null);
    const adherenceTotal = adherenceTotals.completed + adherenceTotals.uncompleted;

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;

    const formatMinutesToHM = (minutes: number | null) => {
      if (minutes === null) return null;
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}h ${m}min`;
    };

    return {
      steps: avg(withSteps.map((d) => d.steps)),
      activeMinutes: avg(withActive.map((d) => d.activeMinutes)),
      activeMinutesLabel: formatMinutesToHM(avg(withActive.map((d) => d.activeMinutes))),
      sleepMinutes: avg(withSleep.map((d) => d.sleepMinutes)),
      sleepMinutesLabel: formatMinutesToHM(avg(withSleep.map((d) => d.sleepMinutes))),
      bpSys: avg(withBpSys.map((d) => d.bpSys as number)),
      bpDia: avg(withBpDia.map((d) => d.bpDia as number)),
      recommendationsPct:
        adherenceTotal > 0 ? Math.round((adherenceTotals.completed / adherenceTotal) * 100) : null,
    };
  }, [dailyMetrics, adherenceTotals]);

  const chartThresholds = React.useMemo(() => {
    const asNumberOrNull = (value: unknown) => {
      if (value == null) return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    return {
      steps: asNumberOrNull(thresholds?.steps_goal),
      activeMinutes: asNumberOrNull(thresholds?.active_minutes_green),
      sleepMinutes: asNumberOrNull(thresholds?.sleep_green_min),
      bpSysMax: asNumberOrNull(thresholds?.bp_sys_green_max),
      bpDiaMax: asNumberOrNull(thresholds?.bp_dia_green_max),
    };
  }, [thresholds]);

  const chartYMax = React.useMemo(() => {
    const withPadding = (value: number) => Math.max(1, Math.ceil(value * 1.1));

    const maxSteps = Math.max(...dailyMetrics.map((d) => d.steps), chartThresholds.steps ?? 0, 0);

    const maxActiveMinutes = Math.max(
      ...dailyMetrics.map((d) => d.activeMinutes),
      chartThresholds.activeMinutes ?? 0,
      0
    );
    const maxSleepMinutes = Math.max(
      ...dailyMetrics.map((d) => d.sleepMinutes),
      chartThresholds.sleepMinutes ?? 0,
      0
    );
    const maxBloodPressure = Math.max(
      ...dailyMetrics.flatMap((d) => [d.bpSys ?? 0, d.bpDia ?? 0]),
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

  const thresholdStatus = React.useMemo(() => {
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

  const renderThresholdStatus = (isReached: boolean | null) => {
    if (isReached === null) return null;

    return (
      <div className={`flex gap-2 ${isReached ? 'text-[#16A34A]' : 'text-red-600'}`}>
        <div className="font-bold text-lg">{isReached ? t('Done') : t('Not reached')}</div>
        {isReached ? <CircleCheckFill className="w-8 h-8" /> : <CircleXFill className="w-8 h-8" />}
      </div>
    );
  };

  if (combinedHistoryLoading) {
    return <PatientProcessSkeleton />;
  }

  if (combinedHistoryError || !combinedHistory) {
    return (
      <Layout>
        <div className="text-red-600 text-center py-10">{t('Failed to load health data.')}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div>
        <h1 className="text-2xl font-bold p-0 m-0 text-zinc-800">{t('Process')}</h1>
        <h2 className="text-lg p-0 m-0 text-zinc-600">
          {format(new Date(`${from}T00:00:00Z`), 'dd.MM.')} -{' '}
          {format(new Date(`${to}T00:00:00Z`), 'dd.MM.')}
        </h2>
      </div>

      <div
        className="mt-8 flex gap-1 no-scrollbar overflow-y-auto"
        role="group"
        aria-label={t('Filter by time period')}
      >
        {filterOptions.map(({ value, label }) => (
          <Badge
            key={value}
            onClick={() => setProcessFilter(value)}
            className={`font-medium rounded-full py-[10px] px-4 border-none shadow-none text-nowrap ${
              processFilter === value ? 'bg-white text-zinc-800' : 'bg-zinc-50 text-zinc-400'
            }`}
            role="button"
            aria-pressed={processFilter === value}
            aria-label={processFilter === 'week' ? t('Show last week') : t('Show last month')}
          >
            {label}
          </Badge>
        ))}
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex flex-col gap-2">
            <div className="p-4 border border-accent rounded-3xl">
              <div>
                <div className="font-bold text-lg text-zinc-800">{t('Recommendations')}</div>
                <div className="font-medium text-sm text-zinc-500 flex gap-1 items-center">
                  {t('Done')}
                  <div className="w-3 h-3 rounded-full bg-[#F1ADCF]" />
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {averageMetrics.recommendationsPct !== null
                      ? `${averageMetrics.recommendationsPct}%`
                      : '--%'}
                  </div>
                </div>
                <div className="flex-1">
                  <ChartContainer config={recommendationsChartConfig} className="w-full">
                    <BarChart
                      layout="vertical"
                      accessibilityLayer
                      data={[adherenceTotals]}
                      margin={{ bottom: 16 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis type="category" hide />
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="completed" stackId="a" fill="#F1ADCF" radius={18}>
                        <LabelList
                          dataKey="completed"
                          content={({ x, y, height, value }) => (
                            <text
                              x={Number(x)}
                              y={Number(y) + Number(height) + 16}
                              textAnchor="start"
                              className="fill-zinc-400 text-xs font-medium"
                            >
                              {String(value)}
                            </text>
                          )}
                        />
                      </Bar>
                      <Bar dataKey="uncompleted" stackId="a" fill="#FCEFF5" radius={18}>
                        <LabelList
                          dataKey="uncompleted"
                          content={({ x, y, height, value }) => (
                            <text
                              x={Number(x)}
                              y={Number(y) + Number(height) + 16}
                              textAnchor="start"
                              className="fill-zinc-400 text-xs font-medium"
                            >
                              {String(value)}
                            </text>
                          )}
                        />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex flex-col gap-2">
            <div className="p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Steps')}</div>
                  <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>
                </div>
                {renderThresholdStatus(thresholdStatus.steps)}
              </div>
              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {averageMetrics.steps !== null ? averageMetrics.steps.toLocaleString() : '--'}
                  </div>
                </div>
                <div className="flex-1">
                  <ChartContainer config={stepsChartConfig} className="w-full">
                    <BarChart accessibilityLayer data={dailyMetrics}>
                      <CartesianGrid vertical={false} />
                      <YAxis hide domain={[0, chartYMax.steps]} />
                      {chartThresholds.steps !== null && (
                        <ReferenceLine
                          y={chartThresholds.steps}
                          stroke="#e4e4e7"
                          strokeWidth={2}
                          strokeDasharray="8 8"
                        />
                      )}
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        tickMargin={8}
                        axisLine={false}
                        tickFormatter={(date) => date.slice(3)}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="steps" fill="#F1ADCF" radius={18} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>

            <div className="p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Active Minutes')}</div>
                  <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>
                </div>
                {renderThresholdStatus(thresholdStatus.activeMinutes)}
              </div>
              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {averageMetrics.activeMinutesLabel !== null
                      ? averageMetrics.activeMinutesLabel
                      : '--'}
                  </div>
                </div>
                <div className="flex-1">
                  <ChartContainer config={activeMinutesChartConfig} className="w-full">
                    <BarChart accessibilityLayer data={dailyMetrics}>
                      <CartesianGrid vertical={false} />
                      <YAxis hide domain={[0, chartYMax.activeMinutes]} />
                      {chartThresholds.activeMinutes !== null && (
                        <ReferenceLine
                          y={chartThresholds.activeMinutes}
                          stroke="#e4e4e7"
                          strokeWidth={2}
                          strokeDasharray="8 8"
                        />
                      )}
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        tickMargin={8}
                        axisLine={false}
                        tickFormatter={(date) => date.slice(3)}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="activeMinutes" fill="#F1ADCF" radius={18} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>

            <div className="p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Sleep')}</div>
                  <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>
                </div>
                {renderThresholdStatus(thresholdStatus.sleepMinutes)}
              </div>
              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {averageMetrics.sleepMinutesLabel !== null
                      ? averageMetrics.sleepMinutesLabel
                      : '--'}
                  </div>
                </div>
                <div className="flex-1">
                  <ChartContainer config={sleepChartConfig} className="w-full">
                    <BarChart accessibilityLayer data={dailyMetrics}>
                      <CartesianGrid vertical={false} />
                      <YAxis hide domain={[0, chartYMax.sleepMinutes]} />
                      {chartThresholds.sleepMinutes !== null && (
                        <ReferenceLine
                          y={chartThresholds.sleepMinutes}
                          stroke="#e4e4e7"
                          strokeWidth={2}
                          strokeDasharray="8 8"
                        />
                      )}
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        tickMargin={8}
                        axisLine={false}
                        tickFormatter={(date) => date.slice(3)}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Bar dataKey="sleepMinutes" fill="#F1ADCF" radius={18} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
          <div className="flex flex-col gap-2">
            <div className="p-4 border border-accent rounded-3xl">
              <div className="flex justify-between">
                <div>
                  <div className="font-bold text-lg text-zinc-800">{t('Blood pressure')}</div>
                  <div className="font-medium text-sm text-zinc-500">{t('Average per day')}</div>
                </div>
                {renderThresholdStatus(thresholdStatus.bloodPressure)}
              </div>
              <div className="flex items-end">
                <div className="flex-1">
                  <div className="font-bold text-[28px] text-zinc-900">
                    {averageMetrics.bpSys !== null ? averageMetrics.bpSys : '--'}
                    <br />/{averageMetrics.bpDia !== null ? averageMetrics.bpDia : '--'} mmHg
                  </div>
                </div>
                <div className="flex-1">
                  <ChartContainer config={bloodPressureChartConfig} className="w-full">
                    <LineChart accessibilityLayer data={dailyMetrics}>
                      <CartesianGrid vertical={false} />
                      <YAxis hide domain={[0, chartYMax.bloodPressure]} />
                      {chartThresholds.bpSysMax !== null && (
                        <ReferenceLine
                          y={chartThresholds.bpSysMax}
                          stroke="#e4e4e7"
                          strokeWidth={2}
                          strokeDasharray="8 8"
                        />
                      )}
                      {chartThresholds.bpDiaMax !== null && (
                        <ReferenceLine
                          y={chartThresholds.bpDiaMax}
                          stroke="#e4e4e7"
                          strokeWidth={2}
                          strokeDasharray="8 8"
                        />
                      )}
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        tickMargin={8}
                        axisLine={false}
                        tickFormatter={(date) => date.slice(3)}
                      />
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                      <Line
                        type="monotone"
                        dataKey="bpSys"
                        stroke="#F1ADCF"
                        strokeWidth={4}
                        dot={true}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="bpDia"
                        stroke="#F1ADCF80"
                        strokeWidth={4}
                        dot={true}
                        connectNulls={true}
                      />
                    </LineChart>
                  </ChartContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
});

export default PatientProcess;
