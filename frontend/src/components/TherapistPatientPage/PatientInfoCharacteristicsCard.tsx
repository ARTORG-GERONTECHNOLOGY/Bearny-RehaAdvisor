import React from 'react';
import { Row, Col } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import PatientInfoFieldRenderer, { PatientFieldConfig } from './PatientInfoFieldRenderer';

interface PatientInfoCharacteristicsCardProps {
  store: PatientPopupStore;
}

export const CHARACTERISTICS_FIELDS: PatientFieldConfig[] = [
  { be_name: 'level_of_education', label: 'Level of education', type: 'text', maxLength: 200 },
  { be_name: 'professional_status', label: 'Professional status', type: 'text', maxLength: 200 },
  { be_name: 'marital_status', label: 'Marital status', type: 'text', maxLength: 200 },
  {
    be_name: 'lifestyle',
    label: 'Lifestyle (comma separated)',
    type: 'comma-list',
    maxLength: 1000,
    placeholder: 'e.g. Non-smoker, Active, Vegetarian',
  },
  {
    be_name: 'personal_goals',
    label: 'Personal goals (comma separated)',
    type: 'comma-list',
    maxLength: 1000,
    placeholder: 'e.g. Walk 30 min daily, Return to work',
  },
  {
    be_name: 'social_support',
    label: 'Social support (comma separated)',
    type: 'comma-list',
    maxLength: 1000,
    placeholder: 'e.g. Family, Friends, Community group',
  },
  { be_name: 'restrictions', label: 'Restrictions', type: 'textarea', maxLength: 2000 },
];

const PatientInfoCharacteristicsCard: React.FC<PatientInfoCharacteristicsCardProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();

    return (
      <div className="mb-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Characteristics')}</CardTitle>
          </CardHeader>
          <CardContent>
            {!store.isEditing ? (
              <div className="grid grid-cols-2 items-center justify-items-start gap-2">
                {CHARACTERISTICS_FIELDS.map((field) => (
                  <PatientInfoFieldRenderer key={field.be_name} store={store} field={field} />
                ))}
              </div>
            ) : (
              <Row className="g-3">
                {CHARACTERISTICS_FIELDS.map((field) => (
                  <Col xs={12} md={6} key={field.be_name}>
                    <PatientInfoFieldRenderer store={store} field={field} />
                  </Col>
                ))}
              </Row>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }
);

export default PatientInfoCharacteristicsCard;
