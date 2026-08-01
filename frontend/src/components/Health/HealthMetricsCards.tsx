import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import type { HealthPageStore } from '@/stores/healthPageStore';

import SleepChart, {
  averageSleepMinutes,
  filterSleepInRange,
  formatSleepDuration,
  TIER_COLOR as SLEEP_TIER_COLOR,
} from '@/components/Health/charts/SleepChart';
import WearTimeChart, {
  averageWearTime,
  filterWearTimeInRange,
} from '@/components/Health/charts/WearTimeChart';
import HRZonesStacked, {
  averageActiveHRZoneMinutes,
  filterHRZonesInRange,
  formatHM,
  STACK_ZONE_KEYS,
  ZONE_COLOR,
  ZONE_LABEL_KEY,
} from '@/components/Health/charts/HRZonesStacked';
import AdherenceLine, {
  averageAdherencePct,
  filterAdherenceInRange,
} from '@/components/Health/charts/AdherenceLine';
import WeightChart, {
  averageWeight,
  filterWeightInRange,
} from '@/components/Health/charts/WeightChart';
import StepsChart, {
  averageSteps,
  filterStepsInRange,
} from '@/components/Health/charts/StepsChart';
import ActiveMinutesChart, {
  averageActiveMinutes,
  filterActiveMinutesInRange,
  TIER_COLOR as ACTIVE_MINUTES_TIER_COLOR,
} from '@/components/Health/charts/ActiveMinutesChart';
import RestingHRChart, {
  averageRestingHR,
  filterRestingHRInRange,
} from '@/components/Health/charts/RestingHRChart';
import BreathingChart, {
  averageBreathingRate,
  filterBreathingInRange,
} from '@/components/Health/charts/BreathingChart';
import BloodPressureChart, {
  averageBloodPressure,
  filterBloodPressureInRange,
  TIER_COLOR as BP_TIER_COLOR,
} from '@/components/Health/charts/BloodPressureChart';
import ExerciseSessionsChart, {
  averageExerciseMinutes,
} from '@/components/Health/charts/ExerciseSessionsChart';
import MetricDetailDialog from '@/components/Health/charts/MetricDetailDialog';
import type { MetricDetailColumn } from '@/components/Health/charts/MetricDetailDialog';
import QuestionnaireResultsTable, {
  countQuestionnaireDays,
} from '@/components/Health/QuestionnaireResultsTable';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { colors } from '@/lib/colors';
import { formatDurationMinutes } from '@/utils/dateFormat';
import { thresholdTier } from '@/utils/healthCharts';
import type { ThresholdTier } from '@/utils/healthCharts';

import AdherenceIcon from '@/assets/icons/calendar-check-outline.svg?react';
import WearTimeIcon from '@/assets/icons/watch-heart-outline.svg?react';
import QuestionnaireIcon from '@/assets/icons/clipboard-list-outline.svg?react';
import RestingHRIcon from '@/assets/icons/heart-outline.svg?react';
import BloodPressureIcon from '@/assets/icons/droplet-outline.svg?react';
import HRZonesIcon from '@/assets/icons/clock-outline.svg?react';
import StepsIcon from '@/assets/icons/shoe-sneakers-outline.svg?react';
import ActiveMinutesIcon from '@/assets/icons/person-walking-outline.svg?react';
import WeightIcon from '@/assets/icons/weight-scale-outline.svg?react';
import ExerciseIcon from '@/assets/icons/bicep-outline.svg?react';
import SleepIcon from '@/assets/icons/moon-outline.svg?react';
import BreathingIcon from '@/assets/icons/lungs-outline.svg?react';

// Each ref points at the chart's wrapping <div> (not the inner <svg> — Recharts mounts
// that asynchronously once it measures a size). Callers needing the actual <svg> — e.g. for
// PDF export — should query `ref.current?.querySelector('svg')` at the moment they need it.
export type SvgRefs = {
  adherence: React.RefObject<HTMLDivElement>;
  restingHR: React.RefObject<HTMLDivElement>;
  sleep: React.RefObject<HTMLDivElement>;
  wearTime: React.RefObject<HTMLDivElement>;
  hrZones: React.RefObject<HTMLDivElement>;
  steps: React.RefObject<HTMLDivElement>;
  activeMinutes: React.RefObject<HTMLDivElement>;
  breathing: React.RefObject<HTMLDivElement>;
  weight: React.RefObject<HTMLDivElement>;
  bloodPressure: React.RefObject<HTMLDivElement>;
  exercise: React.RefObject<HTMLDivElement>;
};

type Props = {
  store: HealthPageStore;
  t: (k: string) => string;
  lang: string;
  svgRefs: SvgRefs;
};

const MetricCard: React.FC<{
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
}> = ({ icon: Icon, label, value, children, onClick }) => (
  <Card
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onClick();
            }
          }
        : undefined
    }
    className={onClick ? 'cursor-pointer transition-shadow hover:shadow-md' : undefined}
  >
    <CardHeader>
      <CardDescription className="flex items-center gap-1">
        <Icon className="h-4 w-4" />
        {label}
      </CardDescription>
      <CardTitle>{value}</CardTitle>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

// Taller than the card preview
const DETAIL_CHART_CLASS = 'h-80 max-h-80';

// Pairs a MetricCard with its click-to-expand detail dialog
const MetricCardWithDialog = <Row extends { date: string }>({
  t,
  icon,
  label,
  value,
  emptyMessage,
  start,
  end,
  rows,
  columns,
  legend,
  cardRef,
  renderChart,
}: {
  t: (k: string) => string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  label: string;
  value: React.ReactNode;
  emptyMessage: string;
  start: Date;
  end: Date;
  rows: Row[];
  columns: MetricDetailColumn<Row>[];
  legend?: React.ReactNode;
  cardRef?: React.RefObject<HTMLDivElement>;
  renderChart: (className?: string, ref?: React.RefObject<HTMLDivElement>) => React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);

  const hasData = useMemo(
    () => rows.some((r) => columns.some((c) => r[c.key] != null)),
    [rows, columns]
  );

  return (
    <>
      <MetricCard
        icon={icon}
        label={label}
        value={value}
        onClick={hasData ? () => setOpen(true) : undefined}
      >
        {renderChart(undefined, cardRef)}
      </MetricCard>
      {hasData && (
        <MetricDetailDialog
          open={open}
          onOpenChange={setOpen}
          title={label}
          dateHeader={t('Date')}
          emptyMessage={emptyMessage}
          start={start}
          end={end}
          legend={legend}
          rows={rows}
          columns={columns}
          chart={renderChart(DETAIL_CHART_CLASS)}
        />
      )}
    </>
  );
};

const useMetricAvg = <T, R>(
  fn: (data: T[], start?: Date | null, end?: Date | null) => R,
  data: T[],
  start: Date,
  end: Date
): R => useMemo(() => fn(data, start, end), [fn, data, start, end]);

// Shared green/yellow/red threshold coloring for a detail table cell
const colorFromTier =
  (
    green: number | null | undefined,
    yellow: number | null | undefined,
    higherIsBetter: boolean,
    palette: Record<ThresholdTier, string>
  ) =>
  (value: number | null): string | undefined => {
    const tier = thresholdTier(value, green, yellow, higherIsBetter);
    return tier ? palette[tier] : undefined;
  };

// Green/yellow goal badges shown above a detail dialog's chart
const GoalLegend: React.FC<{
  t: (k: string) => string;
  goal?: number | null;
  yellowGoal?: number | null;
  format: (value: number) => string;
}> = ({ t, goal, yellowGoal, format }) => {
  if (goal == null && yellowGoal == null) return null;
  return (
    <>
      {goal != null && <Badge variant="dashboard-success">{`${t('Goal')}: ${format(goal)}`}</Badge>}
      {yellowGoal != null && (
        <Badge variant="dashboard-warning">{`${t('Fair')}: ${format(yellowGoal)}`}</Badge>
      )}
    </>
  );
};

// Same idea as GoalLegend, but for blood pressure's sys/dia pair of thresholds
const BloodPressureGoalLegend: React.FC<{
  t: (k: string) => string;
  sysGreenMax?: number | null;
  diaGreenMax?: number | null;
  sysYellowMax?: number | null;
  diaYellowMax?: number | null;
}> = ({ t, sysGreenMax, diaGreenMax, sysYellowMax, diaYellowMax }) => {
  const fmt = (v: number | null | undefined) => (v != null ? Math.round(v) : '--');
  const hasGreen = sysGreenMax != null || diaGreenMax != null;
  const hasYellow = sysYellowMax != null || diaYellowMax != null;
  if (!hasGreen && !hasYellow) return null;
  return (
    <>
      {hasGreen && (
        <Badge variant="dashboard-success">
          {`${t('Goal')}: ≤${fmt(sysGreenMax)}/${fmt(diaGreenMax)}`}
        </Badge>
      )}
      {hasYellow && (
        <Badge variant="dashboard-warning">
          {`${t('Fair')}: ≤${fmt(sysYellowMax)}/${fmt(diaYellowMax)}`}
        </Badge>
      )}
    </>
  );
};

const HealthMetricsCards: React.FC<Props> = observer(({ store, t, lang, svgRefs }) => {
  const start = store.startDate;
  const end = store.endDate;

  const avgAdherence = useMetricAvg(averageAdherencePct, store.adherenceData, start, end);
  const avgBloodPressure = useMetricAvg(averageBloodPressure, store.fitbitData, start, end);
  const fmtBp = (v: number | null) => (v != null ? Math.round(v) : '--');

  const avgWeight = useMetricAvg(averageWeight, store.fitbitData, start, end);
  const avgSteps = useMetricAvg(averageSteps, store.fitbitData, start, end);
  const avgWearTime = useMetricAvg(averageWearTime, store.fitbitData, start, end);
  const avgActiveMinutes = useMetricAvg(averageActiveMinutes, store.fitbitData, start, end);
  const avgRestingHR = useMetricAvg(averageRestingHR, store.fitbitData, start, end);
  const avgActiveHRZone = useMetricAvg(averageActiveHRZoneMinutes, store.fitbitData, start, end);
  const avgBreathingRate = useMetricAvg(averageBreathingRate, store.fitbitData, start, end);
  const avgExerciseMinutes = useMetricAvg(averageExerciseMinutes, store.fitbitData, start, end);
  const avgSleepMinutes = useMetricAvg(averageSleepMinutes, store.fitbitData, start, end);
  const questionnaireDaysCount = useMetricAvg(
    countQuestionnaireDays,
    store.questionnaireData,
    start,
    end
  );

  const adherenceRows = useMetricAvg(filterAdherenceInRange, store.adherenceData, start, end);
  const wearTimeRows = useMetricAvg(filterWearTimeInRange, store.fitbitData, start, end);
  const restingHRRows = useMetricAvg(filterRestingHRInRange, store.fitbitData, start, end);
  const bloodPressureRows = useMetricAvg(filterBloodPressureInRange, store.fitbitData, start, end);
  const hrZoneRows = useMetricAvg(filterHRZonesInRange, store.fitbitData, start, end);
  // A day the device never reported and a day with genuinely zero active minutes both come
  // back as 0 — treat 0 as "no data" here so the table doesn't fill up with all-zero rows.
  const hrZoneDialogRows = useMemo(
    () =>
      hrZoneRows.map((r) => ({
        date: r.date,
        fatBurn: r.fatBurn > 0 ? r.fatBurn : null,
        cardio: r.cardio > 0 ? r.cardio : null,
        peak: r.peak > 0 ? r.peak : null,
      })),
    [hrZoneRows]
  );
  const stepsRows = useMetricAvg(filterStepsInRange, store.fitbitData, start, end);
  const activeMinutesRows = useMetricAvg(filterActiveMinutesInRange, store.fitbitData, start, end);
  const weightRows = useMetricAvg(filterWeightInRange, store.fitbitData, start, end);
  const sleepRows = useMetricAvg(filterSleepInRange, store.fitbitData, start, end);
  const breathingRows = useMetricAvg(filterBreathingInRange, store.fitbitData, start, end);

  const adherenceColumns: MetricDetailColumn<(typeof adherenceRows)[number]>[] = [
    { key: 'pct', header: t('Adherence (%)'), format: (v) => `${Math.round(v)}%` },
  ];
  const wearTimeColumns: MetricDetailColumn<(typeof wearTimeRows)[number]>[] = [
    { key: 'wearTime', header: t('Wear Time (min)'), format: (v) => formatDurationMinutes(v) },
  ];
  const restingHRColumns: MetricDetailColumn<(typeof restingHRRows)[number]>[] = [
    { key: 'restingHR', header: t('Resting Heart Rate'), format: (v) => `${Math.round(v)} bpm` },
  ];
  const bloodPressureColumns: MetricDetailColumn<(typeof bloodPressureRows)[number]>[] = [
    {
      key: 'sys',
      header: t('Blood pressure systolic'),
      format: (v) => `${Math.round(v)}`,
      color: colorFromTier(
        store.thresholds.bp_sys_green_max,
        store.thresholds.bp_sys_yellow_max,
        false,
        BP_TIER_COLOR
      ),
    },
    {
      key: 'dia',
      header: t('Blood pressure diastolic'),
      format: (v) => `${Math.round(v)}`,
      color: colorFromTier(
        store.thresholds.bp_dia_green_max,
        store.thresholds.bp_dia_yellow_max,
        false,
        BP_TIER_COLOR
      ),
    },
  ];
  const hrZoneColumns: MetricDetailColumn<(typeof hrZoneDialogRows)[number]>[] =
    STACK_ZONE_KEYS.map((key) => ({
      key,
      header: t(ZONE_LABEL_KEY[key]),
      format: formatHM,
      color: () => ZONE_COLOR[key],
    }));
  const stepsColumns: MetricDetailColumn<(typeof stepsRows)[number]>[] = [
    {
      key: 'steps',
      header: t('Steps'),
      format: (v) => Math.round(v).toLocaleString(),
      color: (v) =>
        v == null
          ? undefined
          : store.thresholds.steps_goal == null || v >= store.thresholds.steps_goal
            ? colors.brand
            : colors.pink,
    },
  ];
  const activeMinutesColumns: MetricDetailColumn<(typeof activeMinutesRows)[number]>[] = [
    {
      key: 'activeMinutes',
      header: t('Active Minutes'),
      format: (v) => `${Math.round(v)} ${t('min')}`,
      color: colorFromTier(
        store.thresholds.active_minutes_green,
        store.thresholds.active_minutes_yellow,
        true,
        ACTIVE_MINUTES_TIER_COLOR
      ),
    },
  ];
  const weightColumns: MetricDetailColumn<(typeof weightRows)[number]>[] = [
    {
      key: 'weight',
      header: `${t('WeightLabel')} (${t('WeightUnit')})`,
      format: (v) => v.toFixed(1),
    },
  ];
  const sleepColumns: MetricDetailColumn<(typeof sleepRows)[number]>[] = [
    {
      key: 'minutesAsleep',
      header: t('Asleep'),
      format: formatSleepDuration,
      color: colorFromTier(
        store.thresholds.sleep_green_min,
        store.thresholds.sleep_yellow_min,
        true,
        SLEEP_TIER_COLOR
      ),
    },
  ];
  const breathingColumns: MetricDetailColumn<(typeof breathingRows)[number]>[] = [
    {
      key: 'breathingRate',
      header: t('Breathing Rate (breaths/min)'),
      format: (v) => v.toFixed(1),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h5 className="text-base font-semibold mb-2">{t('Engagement')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCardWithDialog
            t={t}
            icon={AdherenceIcon}
            label={t('Adherence')}
            value={avgAdherence != null ? `${Math.round(avgAdherence)}%` : '--%'}
            emptyMessage={t('No adherence data')}
            start={start}
            end={end}
            rows={adherenceRows}
            columns={adherenceColumns}
            cardRef={svgRefs.adherence}
            renderChart={(className, ref) => (
              <AdherenceLine
                ref={ref}
                data={store.adherenceData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={WearTimeIcon}
            label={t('Wear Time')}
            value={avgWearTime != null ? `${Math.round(avgWearTime)} ${t('min')}` : '--'}
            emptyMessage={t('No wear time data')}
            start={start}
            end={end}
            rows={wearTimeRows}
            columns={wearTimeColumns}
            cardRef={svgRefs.wearTime}
            renderChart={(className, ref) => (
              <WearTimeChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
          <MetricCard
            icon={QuestionnaireIcon}
            label={t('Questionnaire Results By Date')}
            value={`${questionnaireDaysCount} ${t('Entries')}`}
          >
            <QuestionnaireResultsTable
              data={store.questionnaireData}
              start={start}
              end={end}
              lang={lang || 'en'}
              t={t}
            />
          </MetricCard>
        </div>
      </div>

      <div>
        <h5 className="text-base font-semibold mb-2">{t('Cardiovascular')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCardWithDialog
            t={t}
            icon={RestingHRIcon}
            label={t('Resting HR')}
            value={avgRestingHR != null ? `${Math.round(avgRestingHR)} bpm` : '--'}
            emptyMessage={t('No resting heart rate data')}
            start={start}
            end={end}
            rows={restingHRRows}
            columns={restingHRColumns}
            cardRef={svgRefs.restingHR}
            renderChart={(className, ref) => (
              <RestingHRChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={BloodPressureIcon}
            label={t('Blood pressure')}
            value={`${fmtBp(avgBloodPressure.sys)}/${fmtBp(avgBloodPressure.dia)} mmHg`}
            emptyMessage={t('No blood pressure data')}
            start={start}
            end={end}
            rows={bloodPressureRows}
            columns={bloodPressureColumns}
            cardRef={svgRefs.bloodPressure}
            legend={
              <BloodPressureGoalLegend
                t={t}
                sysGreenMax={store.thresholds.bp_sys_green_max}
                diaGreenMax={store.thresholds.bp_dia_green_max}
                sysYellowMax={store.thresholds.bp_sys_yellow_max}
                diaYellowMax={store.thresholds.bp_dia_yellow_max}
              />
            }
            renderChart={(className, ref) => (
              <BloodPressureChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                sysGreenMax={store.thresholds.bp_sys_green_max}
                diaGreenMax={store.thresholds.bp_dia_green_max}
                sysYellowMax={store.thresholds.bp_sys_yellow_max}
                diaYellowMax={store.thresholds.bp_dia_yellow_max}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={HRZonesIcon}
            label={t('Active HR Time')}
            value={avgActiveHRZone != null ? `${Math.round(avgActiveHRZone)} ${t('min')}` : '--'}
            emptyMessage={t('No heart rate zone data')}
            start={start}
            end={end}
            rows={hrZoneDialogRows}
            columns={hrZoneColumns}
            cardRef={svgRefs.hrZones}
            renderChart={(className, ref) => (
              <HRZonesStacked
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
        </div>
      </div>

      <div>
        <h5 className="text-base font-semibold mb-2">{t('Activity')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCardWithDialog
            t={t}
            icon={StepsIcon}
            label={t('Steps')}
            value={avgSteps != null ? Math.round(avgSteps).toLocaleString() : '--'}
            emptyMessage={t('No steps data')}
            start={start}
            end={end}
            rows={stepsRows}
            columns={stepsColumns}
            cardRef={svgRefs.steps}
            legend={
              <GoalLegend
                t={t}
                goal={store.thresholds.steps_goal}
                format={(v) => Math.round(v).toLocaleString()}
              />
            }
            renderChart={(className, ref) => (
              <StepsChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.steps_goal}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={ActiveMinutesIcon}
            label={t('Active Minutes')}
            value={avgActiveMinutes != null ? `${Math.round(avgActiveMinutes)} ${t('min')}` : '--'}
            emptyMessage={t('No active minutes data')}
            start={start}
            end={end}
            rows={activeMinutesRows}
            columns={activeMinutesColumns}
            cardRef={svgRefs.activeMinutes}
            legend={
              <GoalLegend
                t={t}
                goal={store.thresholds.active_minutes_green}
                yellowGoal={store.thresholds.active_minutes_yellow}
                format={(v) => `${Math.round(v)} ${t('min')}`}
              />
            }
            renderChart={(className, ref) => (
              <ActiveMinutesChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.active_minutes_green}
                yellowGoal={store.thresholds.active_minutes_yellow}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={WeightIcon}
            label={t('WeightLabel')}
            value={`${avgWeight != null ? avgWeight.toFixed(1) : '--'} ${t('WeightUnit').toLocaleLowerCase()}`}
            emptyMessage={t('No weight data')}
            start={start}
            end={end}
            rows={weightRows}
            columns={weightColumns}
            cardRef={svgRefs.weight}
            renderChart={(className, ref) => (
              <WeightChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
          <MetricCard
            icon={ExerciseIcon}
            label={t('Exercises')}
            value={
              avgExerciseMinutes != null ? `${Math.round(avgExerciseMinutes)} ${t('min')}` : '--'
            }
          >
            <ExerciseSessionsChart
              ref={svgRefs.exercise}
              data={store.fitbitData}
              start={start}
              end={end}
            />
          </MetricCard>
        </div>
      </div>

      <div>
        <h5 className="text-base font-semibold mb-2">{t('Sleep & Recovery')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCardWithDialog
            t={t}
            icon={SleepIcon}
            label={t('Sleep')}
            value={avgSleepMinutes != null ? formatSleepDuration(avgSleepMinutes) : '--'}
            emptyMessage={t('No sleep data')}
            start={start}
            end={end}
            rows={sleepRows}
            columns={sleepColumns}
            cardRef={svgRefs.sleep}
            legend={
              <GoalLegend
                t={t}
                goal={store.thresholds.sleep_green_min}
                yellowGoal={store.thresholds.sleep_yellow_min}
                format={formatSleepDuration}
              />
            }
            renderChart={(className, ref) => (
              <SleepChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.sleep_green_min}
                yellowGoal={store.thresholds.sleep_yellow_min}
                className={className}
              />
            )}
          />
          <MetricCardWithDialog
            t={t}
            icon={BreathingIcon}
            label={t('Breathing')}
            value={avgBreathingRate != null ? `${avgBreathingRate.toFixed(1)} / min` : '--'}
            emptyMessage={t('No breathing rate data')}
            start={start}
            end={end}
            rows={breathingRows}
            columns={breathingColumns}
            cardRef={svgRefs.breathing}
            renderChart={(className, ref) => (
              <BreathingChart
                ref={ref}
                data={store.fitbitData}
                start={start}
                end={end}
                className={className}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
});

export default HealthMetricsCards;
