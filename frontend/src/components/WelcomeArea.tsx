import React from 'react';
import VideoPopup from './VideoPopup';
import ArticlePopup from './ArticlePopup';
import authStore from '../stores/authStore'

interface WelcomeAreaProps {
  user: string; // Define the type of user prop (string in this case)
}

const WelcomeArea: React.FC<WelcomeAreaProps> = ({ user }) => {
  // Get the current hour
  const currentHour = new Date().getHours();

  // Determine the welcome message based on the time of day
  const getWelcomeMessage = () => {
    if (currentHour >= 5 && currentHour < 12) {
      return "Good Morning";
    } else if (currentHour >= 12 && currentHour < 17) {
      return "Good Afternoon";
    } else if (currentHour >= 17 && currentHour < 21) {
      return "Good Evening";
    } else {
      return "Good Night";
    }
  };

  const article = {
    title: "Understanding Your Health",
    content: "This article discusses the importance of regular health check-ups, understanding your medical history, and staying informed about your health.",
    imageUrl: "path/to/your/image.jpg", // Optional
  };

  // Set message based on user type (patient or not)
  const getUserMessage = () => {
    if (user === 'patient') {
      return "Here are your recommendations for today.";
    } else {
      return "You can manage patients and review recommendations.";
    }
  };

  return (
    <div className="welcome-area">
      <h2>{getWelcomeMessage()}, {localStorage.getItem('fullName')}</h2>
      <p>{getUserMessage()}</p>
    </div>
  );
};

export default WelcomeArea;
