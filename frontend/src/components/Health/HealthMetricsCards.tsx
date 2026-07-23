import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import type { HealthPageStore } from '@/stores/healthPageStore';

import SleepChart, {
  averageSleepMinutes,
  formatSleepDuration,
} from '@/components/Health/charts/SleepChart';
import WearTimeChart, { averageWearTime } from '@/components/Health/charts/WearTimeChart';
import HRZonesStacked, {
  averageActiveHRZoneMinutes,
} from '@/components/Health/charts/HRZonesStacked';
import AdherenceLine, { averageAdherencePct } from '@/components/Health/charts/AdherenceLine';
import WeightChart, { averageWeight } from '@/components/Health/charts/WeightChart';
import StepsChart, { averageSteps } from '@/components/Health/charts/StepsChart';
import ActiveMinutesChart, {
  averageActiveMinutes,
} from '@/components/Health/charts/ActiveMinutesChart';
import RestingHRChart, { averageRestingHR } from '@/components/Health/charts/RestingHRChart';
import BreathingChart, { averageBreathingRate } from '@/components/Health/charts/BreathingChart';
import BloodPressureChart, {
  averageBloodPressure,
} from '@/components/Health/charts/BloodPressureChart';
import ExerciseSessionsChart, {
  averageExerciseMinutes,
} from '@/components/Health/charts/ExerciseSessionsChart';
import QuestionnaireResultsTable, {
  countQuestionnaireDays,
} from '@/components/Health/QuestionnaireResultsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
}> = ({ icon: Icon, label, value, children }) => (
  <Card>
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

const useMetricAvg = <T, R>(
  fn: (data: T[], start?: Date | null, end?: Date | null) => R,
  data: T[],
  start: Date,
  end: Date
): R => useMemo(() => fn(data, start, end), [fn, data, start, end]);

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

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h5 className="text-base font-semibold mb-2">{t('Engagement')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCard
            icon={AdherenceIcon}
            label={t('Adherence')}
            value={avgAdherence != null ? `${Math.round(avgAdherence)}%` : '--%'}
          >
            <AdherenceLine
              ref={svgRefs.adherence}
              data={store.adherenceData}
              start={start}
              end={end}
            />
          </MetricCard>
          <MetricCard
            icon={WearTimeIcon}
            label={t('Wear Time')}
            value={avgWearTime != null ? `${Math.round(avgWearTime)} ${t('min')}` : '--'}
          >
            <WearTimeChart ref={svgRefs.wearTime} data={store.fitbitData} start={start} end={end} />
          </MetricCard>
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
          <MetricCard
            icon={RestingHRIcon}
            label={t('Resting HR')}
            value={avgRestingHR != null ? `${Math.round(avgRestingHR)} bpm` : '--'}
          >
            <RestingHRChart
              ref={svgRefs.restingHR}
              data={store.fitbitData}
              start={start}
              end={end}
            />
          </MetricCard>
          <MetricCard
            icon={BloodPressureIcon}
            label={t('Blood pressure')}
            value={`${fmtBp(avgBloodPressure.sys)}/${fmtBp(avgBloodPressure.dia)} mmHg`}
          >
            <BloodPressureChart
              ref={svgRefs.bloodPressure}
              data={store.fitbitData}
              start={start}
              end={end}
              sysGreenMax={store.thresholds.bp_sys_green_max}
              diaGreenMax={store.thresholds.bp_dia_green_max}
              sysYellowMax={store.thresholds.bp_sys_yellow_max}
              diaYellowMax={store.thresholds.bp_dia_yellow_max}
            />
          </MetricCard>
          <MetricCard
            icon={HRZonesIcon}
            label={t('Active HR Time')}
            value={avgActiveHRZone != null ? `${Math.round(avgActiveHRZone)} ${t('min')}` : '--'}
          >
            <HRZonesStacked ref={svgRefs.hrZones} data={store.fitbitData} start={start} end={end} />
          </MetricCard>
        </div>
      </div>

      <div>
        <h5 className="text-base font-semibold mb-2">{t('Activity')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <MetricCard
            icon={StepsIcon}
            label={t('Steps')}
            value={avgSteps != null ? Math.round(avgSteps).toLocaleString() : '--'}
          >
            <StepsChart
              ref={svgRefs.steps}
              data={store.fitbitData}
              start={start}
              end={end}
              goal={store.thresholds.steps_goal}
            />
          </MetricCard>
          <MetricCard
            icon={ActiveMinutesIcon}
            label={t('Active Minutes')}
            value={avgActiveMinutes != null ? `${Math.round(avgActiveMinutes)} ${t('min')}` : '--'}
          >
            <ActiveMinutesChart
              ref={svgRefs.activeMinutes}
              data={store.fitbitData}
              start={start}
              end={end}
              goal={store.thresholds.active_minutes_green}
              yellowGoal={store.thresholds.active_minutes_yellow}
            />
          </MetricCard>
          <MetricCard
            icon={WeightIcon}
            label={t('WeightLabel')}
            value={`${avgWeight != null ? avgWeight.toFixed(1) : '--'} ${t('WeightUnit').toLocaleLowerCase()}`}
          >
            <WeightChart ref={svgRefs.weight} data={store.fitbitData} start={start} end={end} />
          </MetricCard>
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
          <MetricCard
            icon={SleepIcon}
            label={t('Sleep')}
            value={avgSleepMinutes != null ? formatSleepDuration(avgSleepMinutes) : '--'}
          >
            <SleepChart
              ref={svgRefs.sleep}
              data={store.fitbitData}
              start={start}
              end={end}
              goal={store.thresholds.sleep_green_min}
              yellowGoal={store.thresholds.sleep_yellow_min}
            />
          </MetricCard>
          <MetricCard
            icon={BreathingIcon}
            label={t('Breathing')}
            value={avgBreathingRate != null ? `${avgBreathingRate.toFixed(1)} / min` : '--'}
          >
            <BreathingChart
              ref={svgRefs.breathing}
              data={store.fitbitData}
              start={start}
              end={end}
            />
          </MetricCard>
        </div>
      </div>
    </div>
  );
});

export default HealthMetricsCards;
