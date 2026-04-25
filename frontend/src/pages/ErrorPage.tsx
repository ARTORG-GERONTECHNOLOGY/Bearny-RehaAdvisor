import React from 'react';
import { useTranslation } from 'react-i18next';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import Card from '@/components/Card';
import Layout from '@/components/Layout';

const ErrorPage: React.FC = () => {
  const { t } = useTranslation();
  const error = useRouteError();

  let message = t('Something went wrong. Please try again later.');

  if (isRouteErrorResponse(error)) {
    message = error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <Layout>
      <Card className="bg-white">
        <h1 className="font-bold text-nok" aria-label="Error">
          {t('Error')}
        </h1>
        <div>{message}</div>
      </Card>
    </Layout>
  );
};

export default ErrorPage;
