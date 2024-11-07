import React from 'react';
import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';

const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1); // Go back to the previous page
  };

  const handleGoHome = () => {
    navigate('/'); // Navigate to the home page
  };

  return (
    <div className="container text-center mt-5">
      <Header isLoggedIn={false}/>
      <h1>Unauthorized Access</h1>
      <p>You do not have permission to access this page.</p>

      <div className="mt-4">
        <Button variant="primary" onClick={handleGoBack} className="me-2">
          Go Back
        </Button>
        <Button variant="secondary" onClick={handleGoHome}>
          Go to Home
        </Button>
      </div>
      <Footer/>
    </div>
  );
};

export default UnauthorizedAccess;
