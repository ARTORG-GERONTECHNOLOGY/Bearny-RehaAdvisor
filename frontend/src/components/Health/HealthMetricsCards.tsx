import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import type { HealthPageStore } from '@/stores/healthPageStore';

import SleepChart from '@/components/Health/charts/SleepChart';
import WearTimeChart, { averageWearTime } from '@/components/Health/charts/WearTimeChart';
import HRZonesStacked from '@/components/Health/charts/HRZonesStacked';
import AdherenceLine, { averageAdherencePct } from '@/components/Health/charts/AdherenceLine';
import WeightChart, { averageWeight } from '@/components/Health/charts/WeightChart';
import StepsChart, { averageSteps } from '@/components/Health/charts/StepsChart';
import RestingHRChart, { averageRestingHR } from '@/components/Health/charts/RestingHRChart';
import BreathingChart, { averageBreathingRate } from '@/components/Health/charts/BreathingChart';
import BloodPressureChart, {
  averageBloodPressure,
} from '@/components/Health/charts/BloodPressureChart';
import ExerciseSessionsChart from '@/components/Health/charts/ExerciseSessionsChart';
import ExerciseSessionsTable from '@/components/Health/charts/ExerciseSessionsTable';
import QuestionnaireResultsTable, {
  countQuestionnaireDays,
} from '@/components/Health/QuestionnaireResultsTable';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SvgRefs = {
  adherence: React.RefObject<SVGSVGElement>;
  restingHR: React.RefObject<SVGSVGElement>;
  sleep: React.RefObject<SVGSVGElement>;
  wearTime: React.RefObject<SVGSVGElement>;
  hrZones: React.RefObject<SVGSVGElement>;
  steps: React.RefObject<SVGSVGElement>;
  breathing: React.RefObject<SVGSVGElement>;
  weight: React.RefObject<SVGSVGElement>;
  bloodPressure: React.RefObject<SVGSVGElement>;
  exercise: React.RefObject<SVGSVGElement>;
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

  const avgRestingHR = useMemo(
    () => averageRestingHR(store.fitbitData, start, end),
    [store.fitbitData, start, end]
  );

  const avgBreathingRate = useMemo(
    () => averageBreathingRate(store.fitbitData, start, end),
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
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
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('HR Zones')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="d-flex justify-content-center">
                <HRZonesStacked
                  ref={svgRefs.hrZones}
                  data={store.fitbitData}
                  start={start}
                  end={end}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h5>{t('Activity')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
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
              <CardTitle>{t('Exercises')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7">
                  <ExerciseSessionsChart
                    ref={svgRefs.exercise}
                    data={store.fitbitData}
                    start={start}
                    end={end}
                  />
                </div>
                <div className="lg:col-span-5">
                  <ExerciseSessionsTable data={store.fitbitData} start={start} end={end} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h5>{t('Sleep & Recovery')}</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('Sleep')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="d-flex justify-content-center">
                <SleepChart ref={svgRefs.sleep} data={store.fitbitData} start={start} end={end} />
              </div>
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
