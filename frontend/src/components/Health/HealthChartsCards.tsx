import React from 'react';
import { observer } from 'mobx-react-lite';
import type { HealthPageStore } from '@/stores/healthPageStore';

import MetricBarOrBox from '@/components/Health/charts/MetricBarOrBox';
import SleepChart from '@/components/Health/charts/SleepChart';
import HRZonesStacked from '@/components/Health/charts/HRZonesStacked';
import AdherenceLine from '@/components/Health/charts/AdherenceLine';
import WeightChart from '@/components/Health/charts/WeightChart';
import BloodPressureChart from '@/components/Health/charts/BloodPressureChart';
import ExerciseSessionsChart from '@/components/Health/charts/ExerciseSessionsChart';
import ExerciseSessionsTable from '@/components/Health/charts/ExerciseSessionsTable';
import QuestionnaireResultsTable from '@/components/Health/QuestionnaireResultsTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

const HealthChartsCards: React.FC<Props> = observer(({ store, t, lang, svgRefs }) => {
  const start = store.startDate;
  const end = store.endDate;

  // Show device-capability hints only when Fitbit records exist but a specific
  // field is null across all of them (device doesn't support it / not worn).
  const hasAnyFitbit = store.fitbitData.length > 0;
  const restingHREmpty =
    hasAnyFitbit && store.fitbitData.every((d) => d.resting_heart_rate == null);
  const wearTimeEmpty = hasAnyFitbit && store.fitbitData.every((d) => d.wear_time_minutes == null);
  const breathingEmpty =
    hasAnyFitbit && store.fitbitData.every((d) => d.breathing_rate?.breathingRate == null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('Adherence')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <AdherenceLine
              ref={svgRefs.adherence}
              data={store.adherenceData}
              start={start}
              end={end}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Questionnaire Results By Date')}</CardTitle>
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

      <Card>
        <CardHeader>
          <CardTitle>{t('Resting HR')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.restingHR}
              titleKey="Resting Heart Rate"
              data={store.fitbitData}
              accessor={(d) => d.resting_heart_rate}
              start={start}
              end={end}
            />
          </div>
          {restingHREmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_resting_hr_empty')}</p>
          )}
        </CardContent>
      </Card>

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
          <CardTitle>{t('Wear Time')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.wearTime}
              titleKey="Wear Time (min)"
              data={store.fitbitData}
              accessor={(d) => d.wear_time_minutes}
              start={start}
              end={end}
            />
          </div>
          {wearTimeEmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_wear_time_empty')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('HR Zones')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <HRZonesStacked ref={svgRefs.hrZones} data={store.fitbitData} start={start} end={end} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Steps')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.steps}
              titleKey="Daily Steps"
              data={store.fitbitData}
              accessor={(d) => d.steps}
              goal={store.thresholds.steps_goal}
              start={start}
              end={end}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Breathing')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.breathing}
              titleKey="Breathing Rate (breaths/min)"
              data={store.fitbitData}
              accessor={(d) => d.breathing_rate?.breathingRate}
              start={start}
              end={end}
            />
          </div>
          {breathingEmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_breathing_rate_empty')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('WeightLabel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <WeightChart ref={svgRefs.weight} data={store.fitbitData} start={start} end={end} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Blood pressure')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="d-flex justify-content-center">
            <BloodPressureChart
              ref={svgRefs.bloodPressure}
              data={store.fitbitData}
              start={start}
              end={end}
            />
          </div>
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
  );
});

export default HealthChartsCards;
