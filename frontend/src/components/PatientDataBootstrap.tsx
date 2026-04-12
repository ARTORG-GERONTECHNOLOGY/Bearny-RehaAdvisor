import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import authStore from '@/stores/authStore';
import { initPatientData, resetPatientDataInit } from '@/services/patientDataService';

const PatientDataBootstrap: React.FC = observer(() => {
  const { i18n } = useTranslation();
  const { isAuthenticated, userType, id } = authStore;

  useEffect(() => {
    if (!isAuthenticated) {
      resetPatientDataInit();
    } else if (userType === 'Patient' && id) {
      initPatientData(id, i18n.language);
    }
  }, [isAuthenticated, userType, id, i18n.language]);

  return null;
});

export default PatientDataBootstrap;
