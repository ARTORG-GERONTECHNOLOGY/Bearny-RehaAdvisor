import React, { useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap'; // Bootstrap components for layout
import Header from '../components/common/Header'; // Header component
import Footer from '../components/common/Footer'; // Footer component
import LoginForm from '../components/forms/LoginForm'; // LoginForm modal component
import { useTranslation } from 'react-i18next'; // Translation hook for multi-language support
// @ts-ignore
import Artog from '../assets/images/artorg.jpg'; // Importing image

const PatientHome: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // State to simulate login status (can be replaced by real login logic)
  const [showLoginModal, setShowLoginModal] = useState(false); // State to control login modal visibility
  const { t } = useTranslation(); // Hook for translating text

  // Function to show the login modal
  const handleShow = () => setShowLoginModal(true);

  // Function to close the login modal
  const handleClose = () => setShowLoginModal(false);

  return (
    <>
      {/* Main container that spans full viewport height (vh-100) */}
        <Container fluid className="d-flex flex-column vh-100">
          {/* Header Component */}
          <Header isLoggedIn={isLoggedIn} /> {/* Header receives the login status as prop */}

          {/* Main content section: vertically and horizontally centered */}
          <Row className="flex-grow-1 d-flex justify-content-center align-items-center">
            <Col xs="auto" className="text-center">
              {/* Image */}
              <img src='/home.jpg' alt="Post-telereha Advisor Logo" style={{ maxWidth: '30%', height: 'auto' }} />
            </Col>
          </Row>

          {/* Login Button Section */}
          <Row className="d-flex justify-content-center mb-5">
            <Col xs="auto" className="text-center">
              <Button
                style={{ width: '200px', height: '75px' }} // Inline styles for button dimensions
                onClick={handleShow} // Show login modal when button is clicked
              >
                {t('Login')} {/* Translated button text */}
              </Button>
            </Col>
          </Row>

          {/* Login Form Modal */}
          <LoginForm show={showLoginModal} handleClose={handleClose} pageType="patient" /> {/* Modal for patient login */}
        </Container>

        {/* Footer Component */}
        <Footer /> {/* Footer placed outside the main container to be rendered at the bottom */}
    </>
  );
};

export default PatientHome;
