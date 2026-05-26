import React from 'react';
import { observer } from 'mobx-react-lite';
import { Accordion, Col, Row } from 'react-bootstrap';
import type { HealthPageStore } from '@/stores/healthPageStore';

import MetricBarOrBox from '@/components/Health/charts/MetricBarOrBox';
import SleepChart from '@/components/Health//charts/SleepChart';
import HRZonesStacked from '@/components/Health//charts/HRZonesStacked';
import AdherenceLine from '@/components/Health//charts/AdherenceLine';
import WeightChart from '@/components/Health//charts/WeightChart';
import BloodPressureChart from '@/components/Health//charts/BloodPressureChart';
import ExerciseSessionsChart from '@/components/Health//charts/ExerciseSessionsChart';
import ExerciseSessionsTable from '@/components/Health//charts/ExerciseSessionsTable';
import QuestionnaireResultsTable from '@/components/Health//QuestionnaireResultsTable';

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

const HealthChartsAccordion: React.FC<Props> = observer(({ store, t, lang, svgRefs }) => {
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
    <Accordion defaultActiveKey={['0']} alwaysOpen className="shadow-sm">
      <Accordion.Item eventKey="0">
        <Accordion.Header>{t('Adherence')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <AdherenceLine
              ref={svgRefs.adherence}
              data={store.adherenceData}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="1">
        <Accordion.Header>{t('Questionnaire Results By Date')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <QuestionnaireResultsTable
            data={store.questionnaireData}
            start={start}
            end={end}
            lang={lang || 'en'}
            t={t}
          />
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="2">
        <Accordion.Header>{t('Resting HR')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.restingHR}
              titleKey="Resting Heart Rate"
              data={store.fitbitData}
              accessor={(d) => d.resting_heart_rate}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
          {restingHREmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_resting_hr_empty')}</p>
          )}
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="3">
        <Accordion.Header>{t('Sleep')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <SleepChart ref={svgRefs.sleep} data={store.fitbitData} start={start} end={end} />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="4">
        <Accordion.Header>{t('Wear Time')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.wearTime}
              titleKey="Wear Time (min)"
              data={store.fitbitData}
              accessor={(d) => d.wear_time_minutes}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
          {wearTimeEmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_wear_time_empty')}</p>
          )}
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="5">
        <Accordion.Header>{t('HR Zones')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <HRZonesStacked ref={svgRefs.hrZones} data={store.fitbitData} start={start} end={end} />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="6">
        <Accordion.Header>{t('Steps')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.steps}
              titleKey="Daily Steps"
              data={store.fitbitData}
              accessor={(d) => d.steps}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="7">
        <Accordion.Header>{t('Breathing')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.breathing}
              titleKey="Breathing Rate (breaths/min)"
              data={store.fitbitData}
              accessor={(d) => d.breathing_rate?.breathingRate}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
          {breathingEmpty && (
            <p className="text-muted small text-center mt-1">{t('hint_breathing_rate_empty')}</p>
          )}
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="8">
        <Accordion.Header>{t('WeightLabel')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <WeightChart ref={svgRefs.weight} data={store.fitbitData} start={start} end={end} />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="9">
        <Accordion.Header>{t('Blood pressure')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <BloodPressureChart
              ref={svgRefs.bloodPressure}
              data={store.fitbitData}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="10">
        <Accordion.Header>{t('Exercises')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <Row className="g-3">
            <Col xs={12} lg={7}>
              <ExerciseSessionsChart
                ref={svgRefs.exercise}
                data={store.fitbitData}
                start={start}
                end={end}
              />
            </Col>
            <Col xs={12} lg={5}>
              <ExerciseSessionsTable data={store.fitbitData} start={start} end={end} />
            </Col>
          </Row>
        </Accordion.Body>
      </Accordion.Item>
    </Accordion>
  );
});

export default HealthChartsAccordion;
