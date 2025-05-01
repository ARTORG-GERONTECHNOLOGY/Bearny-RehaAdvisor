import React from 'react';
import { Button, Card, Col, Container, Row } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import { useTranslation } from 'react-i18next';

const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleGoBack = () => navigate(-1);
  const handleGoHome = () => navigate('/');

  return (
    <Container fluid className="d-flex flex-column min-vh-100 px-3">
      {/* Header */}
      <Header isLoggedIn={false} />

      {/* Main Content */}
      <Container className="flex-grow-1 d-flex align-items-center justify-content-center">
        <Row className="w-100 justify-content-center">
          <Col xs={12} md={10} lg={8} xl={6}>
            <Card className="shadow-sm p-4 text-center">
              <Card.Body>
                <h1 className="mb-3">{t('Unauthorized Access')}</h1>
                <p className="mb-4">{t('You do not have permission to access this page.')}</p>

                <div className="d-grid gap-2 d-sm-flex justify-content-center">
                  <Button variant="primary" onClick={handleGoBack}>
                    {t('Go Back')}
                  </Button>
                  <Button variant="secondary" onClick={handleGoHome}>
                    {t('Go to Home')}
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Footer */}
      <Footer />
    </Container>
  );
};

export default UnauthorizedAccess;
