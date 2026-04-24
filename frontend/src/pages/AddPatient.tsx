import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import RegisterPatientForm from '../components/AddPatient/RegisterPatientForm';
import useAuthGuard from '../hooks/useAuthGuard';
import authStore from '../stores/authStore';
import Layout from '@/components/Layout';
import Card from '@/components/Card';
import PageHeader from '@/components/PageHeader';

const AddPatient: React.FC = () => {
  const { t } = useTranslation();

  // Restrict to therapists
  useAuthGuard('Therapist');

  const therapistId = authStore.id;

  useEffect(() => {
    document.title = t('AddaNewPatient') || 'Add New Patient';
  }, [t]);

  return (
    <Layout>
      <PageHeader title={t('AddaNewPatient')} />

      <Card className="mt-4">
        <RegisterPatientForm therapist={therapistId} />
      </Card>
    </Layout>
  );
};

export default AddPatient;
export { AddPatient };
