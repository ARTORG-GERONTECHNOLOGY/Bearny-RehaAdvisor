import React from 'react';
import { observer } from 'mobx-react-lite';
import { Accordion, Col, Row } from 'react-bootstrap';
import type { HealthPageStore } from '../../stores/healthPageStore';

import MetricBarOrBox from './charts/MetricBarOrBox';
import SleepChart from './charts/SleepChart';
import HRZonesStacked from './charts/HRZonesStacked';
import AdherenceLine from './charts/AdherenceLine';
import WeightChart from './charts/WeightChart';
import BloodPressureChart from './charts/BloodPressureChart';
import ExerciseSessionsChart from './charts/ExerciseSessionsChart';
import ExerciseSessionsTable from './charts/ExerciseSessionsTable';
import QuestionnaireResultsTable from './QuestionnaireResultsTable';

type SvgRefs = {
  adherence: React.RefObject<SVGSVGElement>;
  restingHR: React.RefObject<SVGSVGElement>;
  sleep: React.RefObject<SVGSVGElement>;
  wearTime: React.RefObject<SVGSVGElement>;
  hrZones: React.RefObject<SVGSVGElement>;
  floors: React.RefObject<SVGSVGElement>;
  steps: React.RefObject<SVGSVGElement>;
  distance: React.RefObject<SVGSVGElement>;
  breathing: React.RefObject<SVGSVGElement>;
  hrv: React.RefObject<SVGSVGElement>;
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

      <Accordion.Item eventKey="3">
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
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="4">
        <Accordion.Header>{t('Sleep')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <SleepChart ref={svgRefs.sleep} data={store.fitbitData} start={start} end={end} />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="4b">
        <Accordion.Header>{t('Wear Time')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.wearTime}
              titleKey="Wear Time (min)"
              data={store.fitbitData}
              accessor={(d) => (d as any).wear_time_minutes}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
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
        <Accordion.Header>{t('Floors')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.floors}
              titleKey="Floors Climbed"
              data={store.fitbitData}
              accessor={(d) => d.floors}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="7">
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

      <Accordion.Item eventKey="8">
        <Accordion.Header>{t('Distance')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.distance}
              titleKey="Distance Traveled (km)"
              data={store.fitbitData}
              accessor={(d) => d.distance}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="9">
        <Accordion.Header>{t('Breathing')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.breathing}
              titleKey="Breathing Rate (breaths/min)"
              data={store.fitbitData}
              accessor={(d) => (d as any).breathing_rate?.breathingRate}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="10">
        <Accordion.Header>{t('HRV')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <MetricBarOrBox
              ref={svgRefs.hrv}
              titleKey="Heart Rate Variability (dailyRmssd in ms)"
              data={store.fitbitData}
              accessor={(d) => (d as any).hrv?.dailyRmssd}
              res={store.chartRes}
              start={start}
              end={end}
            />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="11">
        <Accordion.Header>{t('Weight')}</Accordion.Header>
        <Accordion.Body className="p-2 p-md-3">
          <div className="d-flex justify-content-center">
            <WeightChart ref={svgRefs.weight} data={store.fitbitData} start={start} end={end} />
          </div>
        </Accordion.Body>
      </Accordion.Item>

      <Accordion.Item eventKey="12">
        <Accordion.Header>{t('Blood Pressure')}</Accordion.Header>
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

      <Accordion.Item eventKey="13">
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
