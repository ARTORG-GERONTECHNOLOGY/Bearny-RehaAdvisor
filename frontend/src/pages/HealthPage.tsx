import React, { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import authStore from '@/stores/authStore';

import HealthPageContent from '@/components/Health/HealthPageContent';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon } from 'lucide-react';
import PageHeader from '@/components/PageHeader';

const HealthPage: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    }
  }, [navigate]);

  const patientId = localStorage.getItem('selectedPatient') || '';

  return (
    <Layout>
      <div className="d-flex flex-column min-vh-100">
        <Button size="icon" variant="secondary" onClick={() => navigate(-1)} className="bg-white">
          <ArrowLeftIcon />
          <span className="sr-only">{t('Back')}</span>
        </Button>

        <div className="flex-grow-1 mt-2">
          <PageHeader
            title={
              localStorage.getItem('selectedPatientId') ||
              localStorage.getItem('selectedPatientName') ||
              t('Outcomes Dashboard')
            }
          />

          <HealthPageContent patientId={patientId} />
        </div>
      </div>
    </Layout>
  );
});

export default HealthPage;
