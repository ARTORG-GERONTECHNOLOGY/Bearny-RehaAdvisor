import React from 'react';
import { Col, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import config from '@/config/config.json';
import { appModeStore } from '@/stores/appModeStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import PatientInfoFieldRenderer, { PatientFieldConfig } from './PatientInfoFieldRenderer';

interface PatientInfoProfileCardProps {
  store: PatientPopupStore;
}

const getContactsFields = (store: PatientPopupStore): PatientFieldConfig[] => {
  const clinicProjects = (config as any).therapistInfo?.clinic_projects || {};
  return [
    { be_name: 'last_online_contact', label: 'Last online visit', type: 'date', readOnly: true },
    { be_name: 'last_clinic_visit', label: 'Last clinic visit', type: 'date' },
    { be_name: 'therapist_name', label: 'Therapist', readOnly: true },
    {
      be_name: 'clinic',
      label: 'Clinic',
      type: 'dropdown',
      options: Object.keys(clinicProjects),
      placeholder: 'Select clinic',
      onValueChange: () => store.setField('project', ''),
    },
    {
      be_name: 'project',
      label: 'Project',
      type: 'dropdown',
      options: clinicProjects[store.formData.clinic] || [],
      placeholder: 'Select project',
      disabled: !store.formData.clinic,
    },
    { be_name: 'reha_end_date', label: 'Rehabilitation End Date', type: 'date' },
    { be_name: 'study_end_date', label: 'Study / After-Rehab Plan End Date', type: 'date' },
  ];
};

const PatientInfoProfileCard: React.FC<PatientInfoProfileCardProps> = observer(({ store }) => {
  const { t } = useTranslation();
  const contactsFields = getContactsFields(store);

  return (
    <div className="mb-2 break-inside-avoid-column">
      <Card>
        <CardHeader>
          <CardTitle>{t('Profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="mb-2">{t('Contacts')}</div>
            {!store.isEditing ? (
              <div className="grid grid-cols-2 items-center justify-items-start gap-2">
                {contactsFields.map((field) => (
                  <PatientInfoFieldRenderer key={field.be_name} store={store} field={field} />
                ))}
              </div>
            ) : (
              <Row className="g-3">
                {contactsFields
                  .filter((field) => !field.readOnly)
                  .map((field) => (
                    <Col xs={12} md={6} key={field.be_name}>
                      <PatientInfoFieldRenderer store={store} field={field} />
                    </Col>
                  ))}
              </Row>
            )}
          </div>

          {(config as any).PatientForm.map((section: any, idx: number) => (
            <div key={idx} className="mb-4">
              <Separator className="mb-4" />
              <div className="mb-2">{t(section.title)}</div>
              <Row className="g-3">
                {section.fields
                  .filter((f: any) => !['password', 'repeatPassword'].includes(f.name))
                  .filter(
                    (f: any) =>
                      !appModeStore.hidePiiFields ||
                      !['firstName', 'lastName', 'email', 'phone', 'age'].includes(f.name)
                  )
                  .map((field: any, index: number) => (
                    <Col xs={12} md={6} key={`${section.title}-${field.be_name}-${index}`}>
                      <PatientInfoFieldRenderer store={store} field={field} />
                    </Col>
                  ))}
              </Row>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
});

export default PatientInfoProfileCard;
