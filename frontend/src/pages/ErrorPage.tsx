import React from 'react';
import { useLocation } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

const ErrorPage: React.FC = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const { t } = useTranslation();

  const message =
    queryParams.get('message') ||
    t('There was a problem connecting your Fitbit account. Please try again.');

  return (
    <main className="d-flex flex-column justify-content-center align-items-center min-vh-100 px-3">
      <Container>
        <Row className="justify-content-center text-center">
          <Col xs={12} sm={10} md={8} lg={6}>
            <section className="p-4">
              <h1 className="text-danger display-5 mb-3" aria-label="Error">
                ⚠️ {t('Error')}
              </h1>
              <p className="lead text-break">{message}</p>
              <p className="text-muted mt-3">{t('Please close this window and try again.')}</p>
            </section>
          </Col>
        </Row>
      </Container>
    </main>
  );
};

export default ErrorPage;
