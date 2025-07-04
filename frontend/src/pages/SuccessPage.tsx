import React from 'react';
import { useLocation } from 'react-router-dom';
import { Container, Row, Col, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

const SuccessPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const message =
    queryParams.get('message') || t('Your Fitbit account has been successfully connected.');

  return (
    <Container className="d-flex flex-column justify-content-center align-items-center min-vh-100">
      <Row>
        <Col className="text-center">
          <Alert variant="success" className="p-4">
            <h1 className="mb-3">🎉 {t('Success')}</h1>
            <p className="fs-5">{message}</p>
            <p className="text-muted">{t('You can now close this window.')}</p>
          </Alert>
        </Col>
      </Row>
    </Container>
  );
};

export default SuccessPage;
