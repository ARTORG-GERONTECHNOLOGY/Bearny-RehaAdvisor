import React from 'react';
import VideoPopup from './VideoPopup';
import ArticlePopup from './ArticlePopup';
import authStore from '../stores/authStore'
import { t } from 'i18next';

interface WelcomeAreaProps {
  user: string; // Define the type of user prop (string in this case)
}

const WelcomeArea: React.FC<WelcomeAreaProps> = ({ user }) => {
  // Get the current hour
  const currentHour = new Date().getHours();

  // Determine the welcome message based on the time of day
  const getWelcomeMessage = () => {
    if (currentHour >= 5 && currentHour < 12) {
      return t("Good Morning");
    } else if (currentHour >= 12 && currentHour < 17) {
      return t("Good Afternoon");
    } else if (currentHour >= 17 && currentHour < 21) {
      return t("Good Evening");
    } else {
      return t("Good Night");
    }
  };


  // Set message based on user type (patient or not)
  const getUserMessage = () => {
    if (user === 'patient') {
      return t("Here are your recommendations for");
    } else {
      return t("You can manage patients and review recommendations.");
    }
  };

  return (
    <div className="welcome-area text-center my-4">
      <h2>{getWelcomeMessage()}, {localStorage.getItem('fullName')}</h2>
      <h4>{getUserMessage()}</h4>
    </div>
  );
};

export default WelcomeArea;
