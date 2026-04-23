import React from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import authStore from '@/stores/authStore';
import PageHeader from '@/components/PageHeader';

interface WelcomeAreaProps {
  user: 'patient' | 'therapist' | 'admin' | 'researcher';
}

const WelcomeArea: React.FC<WelcomeAreaProps> = observer(({ user }) => {
  const { t } = useTranslation();

  const currentHour = new Date().getHours();

  const getWelcomeMessage = () => {
    if (currentHour >= 5 && currentHour < 12) return t('Good Morning');
    if (currentHour >= 12 && currentHour < 17) return t('Good Afternoon');
    if (currentHour >= 17 && currentHour < 21) return t('Good Evening');
    return t('Good Night');
  };

  const getUserMessage = () => {
    if (user === 'patient') return t('Here are your recommendations for');
    return t('You can manage patients and review recommendations.');
  };

  const displayName = authStore.firstName || authStore.email || t('User');

  return (
    <PageHeader title={`${getWelcomeMessage()}, ${displayName}`} subtitle={getUserMessage()} />
  );
});

export default WelcomeArea;
