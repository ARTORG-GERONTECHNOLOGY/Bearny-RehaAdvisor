import React from 'react';
import { useTranslation } from 'react-i18next';

interface WelcomeAreaProps {
  user: string; // 'patient' or other
}

const WelcomeArea: React.FC<WelcomeAreaProps> = ({ user }) => {
  const { t } = useTranslation();

  const currentHour = new Date().getHours();

  const getWelcomeMessage = () => {
    if (currentHour >= 5 && currentHour < 12) {
      return t('Good Morning');
    } else if (currentHour >= 12 && currentHour < 17) {
      return t('Good Afternoon');
    } else if (currentHour >= 17 && currentHour < 21) {
      return t('Good Evening');
    } else {
      return t('Good Night');
    }
  };

  const getUserMessage = () => {
    if (user === 'patient') {
      return t('Here are your recommendations for');
    } else {
      return t('You can manage patients and review recommendations.');
    }
  };

  const fullName = localStorage.getItem('fullName') || t('User');

  return (
    <div className="welcome-area text-center my-4 px-2">
      <h2 className="fs-3 fs-md-2 fw-bold text-wrap text-break" aria-label={getWelcomeMessage()}>
        {getWelcomeMessage()}, {fullName}
      </h2>
      <h4 className="fs-6 fs-md-5 text-secondary">{getUserMessage()}</h4>
    </div>
  );
};

export default WelcomeArea;
