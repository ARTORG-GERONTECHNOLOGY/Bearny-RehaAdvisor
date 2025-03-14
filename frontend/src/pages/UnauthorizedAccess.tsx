import React from 'react';
import { Button, Card, Col, Container, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { t } from 'i18next';
const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate(-1); // Go back to the previous page
  };

  const handleGoHome = () => {
    navigate('/'); // Navigate to the home page
  };

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={false}/>
      <Container className="my-5 flex-grow-1">
       <Row className="justify-content-center">
        <Col md={8} lg={6}>
      <h1>{t("Unauthorized Access")}</h1>
      <p>{t("You do not have permission to access this page.")}</p>

      <div className="mt-4">
        <Button variant="primary" onClick={handleGoBack} className="me-2">
           {t("Go Back")}
        </Button>
        <Button variant="secondary" onClick={handleGoHome}>
          {t("Go to Home")}
        </Button>
      </div>
      </Col>
      </Row>
      </Container>
      <Footer/>
   </Container>
  );
};

export default UnauthorizedAccess;
