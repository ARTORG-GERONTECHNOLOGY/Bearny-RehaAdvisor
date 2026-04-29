// src/pages/UnauthorizedAccess.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import Card from '@/components/Card';

const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <Layout>
      <Card className="bg-white max-w-lg mx-auto">
        <h1 className="font-bold" aria-label="Unauthorized Access">
          {t('Unauthorized')}
        </h1>
        <div>{t('You do not have permission to access this page.')}</div>
        <div className="mt-4 flex gap-1 flex-wrap">
          <Button onClick={() => navigate(-1)}>{t('Go back')}</Button>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {t('Go home')}
          </Button>
        </div>
      </Card>
    </Layout>
  );
};

export default UnauthorizedAccess;
