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

// Each ref points at the chart's wrapping <div> (not the inner <svg> — Recharts mounts
// that asynchronously once it measures a size). Callers needing the actual <svg> — e.g. for
// PDF export — should query `ref.current?.querySelector('svg')` at the moment they need it.
type SvgRefs = {
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

const HealthMetricsCards: React.FC<Props> = observer(({ store, t, lang, svgRefs }) => {
  const start = store.startDate;
  const end = store.endDate;

  const avgAdherence = useMemo(
    () => averageAdherencePct(store.adherenceData, start, end),
    [store.adherenceData, start, end]
  );

  const avgBloodPressure = useMemo(
    () => averageBloodPressure(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );
  const fmtBp = (v: number | null) => (v != null ? Math.round(v) : '--');

  const avgWeight = useMemo(
    () => averageWeight(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgSteps = useMemo(
    () => averageSteps(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgWearTime = useMemo(
    () => averageWearTime(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgActiveMinutes = useMemo(
    () => averageActiveMinutes(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgRestingHR = useMemo(
    () => averageRestingHR(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgActiveHRZone = useMemo(
    () => averageActiveHRZoneMinutes(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgBreathingRate = useMemo(
    () => averageBreathingRate(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgExerciseMinutes = useMemo(
    () => averageExerciseMinutes(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgSleepMinutes = useMemo(
    () => averageSleepMinutes(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const questionnaireDaysCount = useMemo(
    () => countQuestionnaireDays(store.questionnaireData, start, end),
    [store.questionnaireData, start, end]
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h5>{t('Engagement')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <Card>
            <CardHeader>
              <CardDescription>{t('Adherence')}</CardDescription>
              <CardTitle>{avgAdherence != null ? `${Math.round(avgAdherence)}%` : '--%'}</CardTitle>
            </CardHeader>
            <CardContent>
              <AdherenceLine
                ref={svgRefs.adherence}
                data={store.adherenceData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Wear Time')}</CardDescription>
              <CardTitle>
                {avgWearTime != null ? `${Math.round(avgWearTime)} ${t('min')}` : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WearTimeChart
                ref={svgRefs.wearTime}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Questionnaire Results By Date')}</CardDescription>
              <CardTitle>
                {questionnaireDaysCount} {t('Entries')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuestionnaireResultsTable
                data={store.questionnaireData}
                start={start}
                end={end}
                lang={lang || 'en'}
                t={t}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h5>{t('Cardiovascular')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <Card>
            <CardHeader>
              <CardDescription>{t('Resting HR')}</CardDescription>
              <CardTitle>
                {avgRestingHR != null ? `${Math.round(avgRestingHR)} bpm` : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RestingHRChart
                ref={svgRefs.restingHR}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Blood pressure')}</CardDescription>
              <CardTitle>
                {fmtBp(avgBloodPressure.sys)}/{fmtBp(avgBloodPressure.dia)} mmHg
              </CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Active HR Time')}</CardDescription>
              <CardTitle>
                {avgActiveHRZone != null ? `${Math.round(avgActiveHRZone)} ${t('min')}` : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HRZonesStacked
                ref={svgRefs.hrZones}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h5>{t('Activity')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <Card>
            <CardHeader>
              <CardDescription>{t('Steps')}</CardDescription>
              <CardTitle>
                {avgSteps != null ? Math.round(avgSteps).toLocaleString() : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StepsChart
                ref={svgRefs.steps}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.steps_goal}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Active Minutes')}</CardDescription>
              <CardTitle>
                {avgActiveMinutes != null ? `${Math.round(avgActiveMinutes)} ${t('min')}` : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActiveMinutesChart
                ref={svgRefs.activeMinutes}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.active_minutes_green}
                yellowGoal={store.thresholds.active_minutes_yellow}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('WeightLabel')}</CardDescription>
              <CardTitle>
                {avgWeight != null ? avgWeight.toFixed(1) : '--'}{' '}
                {t('WeightUnit').toLocaleLowerCase()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeightChart ref={svgRefs.weight} data={store.fitbitData} start={start} end={end} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Exercises')}</CardDescription>
              <CardTitle>
                {avgExerciseMinutes != null
                  ? `${Math.round(avgExerciseMinutes)} ${t('min')}`
                  : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ExerciseSessionsChart
                ref={svgRefs.exercise}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h5>{t('Sleep & Recovery')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 items-start">
          <Card>
            <CardHeader>
              <CardDescription>{t('Sleep')}</CardDescription>
              <CardTitle>
                {avgSleepMinutes != null ? formatSleepDuration(avgSleepMinutes) : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SleepChart
                ref={svgRefs.sleep}
                data={store.fitbitData}
                start={start}
                end={end}
                goal={store.thresholds.sleep_green_min}
                yellowGoal={store.thresholds.sleep_yellow_min}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>{t('Breathing')}</CardDescription>
              <CardTitle>
                {avgBreathingRate != null ? `${avgBreathingRate.toFixed(1)} / min` : '--'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BreathingChart
                ref={svgRefs.breathing}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
});

export default HealthMetricsCards;
