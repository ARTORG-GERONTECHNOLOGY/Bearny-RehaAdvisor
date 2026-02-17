import React from 'react';
import { Col, Form, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import InfoBubble from '../common/InfoBubble';

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
          {/* Patient Type */}
          <Col xs={6}>
            <Form.Group controlId={`patientType-${index}`}>
              <Form.Label>
                {t('PatientType')}{' '}
                <InfoBubble
                  tooltip={t('Select the specialization this intervention applies to.')}
                />
              </Form.Label>
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

          {/* Frequency */}
          <Col xs={6}>
            <Form.Group controlId={`frequency-${index}`}>
              <Form.Label>
                {t('Frequency')}{' '}
                <InfoBubble tooltip={t('How often should this intervention be repeated?')} />
              </Form.Label>
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

          {/* Core vs Supportive */}
          <Col xs={12}>
            <Form.Label className="mt-2">
              {t('Recommendation Type')}{' '}
              <InfoBubble
                tooltip={t(
                  'Mark this as a Core (essential) or Supportive (optional) intervention for the selected patient type.'
                )}
              />
            </Form.Label>
            <div>
              <Form.Check
                inline
                id={`coreExercise-${index}`}
                label={t('Core')}
                type="radio"
                name={`includeOption-${index}`}
                checked={pt.includeOption === true}
                onChange={() => onChange(index, 'includeOption', true)}
              />
              <Form.Check
                inline
                id={`supportiveExercise-${index}`}
                label={t('Supportive')}
                type="radio"
                name={`includeOption-${index}`}
                checked={pt.includeOption === false}
                onChange={() => onChange(index, 'includeOption', false)}
              />
            </div>
          </Col>
        </Row>
      ))}
    </>
  );
};

export default PatientTypeSection;
