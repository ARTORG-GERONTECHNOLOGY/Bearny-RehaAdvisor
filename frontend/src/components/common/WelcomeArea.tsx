import React from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import authStore from '../../stores/authStore';

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
    <div className="welcome-area text-center my-4 px-2">
      <h2 className="fs-3 fs-md-2 fw-bold text-wrap text-break">
        {getWelcomeMessage()}, {displayName}
      </h2>
      <h4 className="fs-6 fs-md-5 text-secondary">{getUserMessage()}</h4>
    </div>
  );
});

export default WelcomeArea;
