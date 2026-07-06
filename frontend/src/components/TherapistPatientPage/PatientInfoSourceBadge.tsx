import React from 'react';
import { Badge } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { PatientPopupStore } from '@/stores/patientPopupStore';

interface PatientInfoSourceBadgeProps {
  store: PatientPopupStore;
  fieldKey: string;
}

const PatientInfoSourceBadge: React.FC<PatientInfoSourceBadgeProps> = observer(
  ({ store, fieldKey }) => {
    const { t } = useTranslation();
    const src = store.getValueSource(fieldKey);
    if (src === 'manual') return <Badge bg="success">{t('Manual')}</Badge>;
    if (src === 'redcap') return <Badge bg="info">{t('REDCap')}</Badge>;
    return null;
  }
);

export default PatientInfoSourceBadge;
