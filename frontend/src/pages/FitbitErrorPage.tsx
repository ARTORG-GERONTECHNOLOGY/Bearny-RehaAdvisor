import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import Card from '@/components/Card';

const FitbitErrorPage: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const { t } = useTranslation();

  const message =
    queryParams.get('message') || t('There was a problem connecting your Fitbit account.');

  return (
    <Layout>
      <Card className="bg-white max-w-lg mx-auto">
        <h1 className="font-bold text-nok" aria-label="Error">
          {t('Error')}
        </h1>
        <div>{message}</div>
        <div className="text-zinc-500">{t('Please close this window and try again.')}</div>
      </Card>
    </Layout>
  );
};

export default FitbitErrorPage;
