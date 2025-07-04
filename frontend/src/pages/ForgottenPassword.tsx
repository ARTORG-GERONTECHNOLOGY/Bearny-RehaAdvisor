import React, { useState } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import apiClient from '../api/client';
import ErrorAlert from '../components/common/ErrorAlert';

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      await apiClient.post('auth/forgot-password/', { email });
      setSuccess(true);
    } catch (err) {
      setError(t('Failed to send password reset link. Please try again.'));
    }
  };

  return (
    <Container fluid className="d-flex flex-column min-vh-100 px-3 px-md-4">
      <Header isLoggedIn={false} />

      <main className="flex-grow-1 d-flex justify-content-center align-items-center">
        <Row className="w-100 justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6} xl={5}>
            <div className="p-4 shadow-sm bg-white rounded">
              <h2 className="text-center mb-4">{t('ForgottenPassword')}</h2>

              {success && (
                <Alert variant="success" className="text-center">
                  {t('Passwordresetlinksent.Pleasecheckyouremail.')}
                </Alert>
              )}

              {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

              <Form onSubmit={handleSubmit}>
                <Form.Group controlId="formEmail" className="mb-3">
                  <Form.Label>{t('Emailaddress')}</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder={t('Enteryouremail')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Form.Group>

                <Button type="submit" variant="primary" className="w-100 py-2">
                  {t('Submit')}
                </Button>
              </Form>
            </div>
          </Col>
        </Row>
      </main>

      <Footer />
    </Container>
  );
};

export default ForgotPassword;
