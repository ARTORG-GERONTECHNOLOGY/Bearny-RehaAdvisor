// src/pages/UnauthorizedAccess.tsx
import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const UnauthorizedAccess: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="d-flex flex-column min-vh-100">
      <Container className="flex-grow-1 d-flex align-items-center justify-content-center py-4">
        <Row className="w-100 justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6} xl={5}>
            <Card className="shadow-sm">
              <Card.Body className="p-4">
                <h1 className="h4 mb-2">{t('Unauthorized')}</h1>
                <p className="text-muted mb-4">
                  {t('You do not have permission to access this page.')}
                </p>

                <div className="d-flex gap-2 flex-wrap">
                  <Button variant="primary" onClick={() => navigate(-1)}>
                    {t('Go back')}
                  </Button>
                  <Button variant="outline-secondary" onClick={() => navigate('/')}>
                    {t('Go home')}
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default UnauthorizedAccess;
