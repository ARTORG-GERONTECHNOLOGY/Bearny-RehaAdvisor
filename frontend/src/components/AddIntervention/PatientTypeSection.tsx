import React from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

interface PatientTypeData {
  type: string;
  frequency: string;
  includeOption: boolean | null;
}

interface PatientTypeSectionProps {
  types: PatientTypeData[];
  diagnoses: string[];
  onChange: (index: number, field: keyof PatientTypeData, value: string | boolean) => void;
}

const PatientTypeSection: React.FC<PatientTypeSectionProps> = ({ types, diagnoses, onChange }) => {
  const { t } = useTranslation();

  const frequencies: string[] = ['Once', 'Daily', 'Weekly', 'Biweekly', 'Monthly'];

  return (
    <>
      {types.map((pt, index) => (
        <Row key={index} className="align-items-center mt-3">
          <Col xs={6}>
            <Form.Group controlId={`patientType-${index}`}>
              <Form.Label>{t('PatientType')}</Form.Label>
              <Form.Control
                as="select"
                value={pt.type}
                onChange={(e) => onChange(index, 'type', e.target.value)}
              >
                <option value="">{t('SelectType')}</option>
                {diagnoses.map((d) => (
                  <option key={d} value={d}>
                    {t(d)}
                  </option>
                ))}
              </Form.Control>
            </Form.Group>
          </Col>

          <Col xs={6}>
            <Form.Group controlId={`frequency-${index}`}>
              <Form.Label>{t('Frequency')}</Form.Label>
              <Form.Control
                as="select"
                value={pt.frequency}
                onChange={(e) => onChange(index, 'frequency', e.target.value)}
              >
                <option value="">{t('SelectFrequency')}</option>
                {frequencies.map((f) => (
                  <option key={f} value={f}>
                    {t(f)}
                  </option>
                ))}
              </Form.Control>
            </Form.Group>
          </Col>

          <Col xs={12}>
            <Form.Check
              inline
              id={`coreExercise-${index}`}
              label={t('CoreExercise')}
              type="radio"
              name={`includeOption-${index}`}
              checked={pt.includeOption === true}
              onChange={() => onChange(index, 'includeOption', true)}
            />
            <Form.Check
              inline
              id={`suportiveExercise-${index}`}
              label={t('Supportive')}
              type="radio"
              name={`includeOption-${index}`}
              checked={pt.includeOption === false}
              onChange={() => onChange(index, 'includeOption', false)}
            />
          </Col>
        </Row>
      ))}
    </>
  );
};

export default PatientTypeSection;
