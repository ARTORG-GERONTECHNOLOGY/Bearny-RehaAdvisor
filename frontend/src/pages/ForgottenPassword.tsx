import React, { useMemo } from 'react';
import { Alert, Button, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import ErrorAlert from '../components/common/ErrorAlert';
import AuthCard from '../components/Auth/AuthCard';

import { ForgotPasswordStore } from '../stores/forgotPasswordStore';

const ForgotPassword: React.FC = observer(() => {
  const { t } = useTranslation();
  const store = useMemo(() => new ForgotPasswordStore(), []);

  return (
    <Container fluid className="d-flex flex-column min-vh-100 px-3 px-md-4">
      <Header isLoggedIn={false} />

      <main className="flex-grow-1 d-flex justify-content-center align-items-center">
        <Row className="w-100 justify-content-center">
          <Col xs={12} sm={10} md={8} lg={6} xl={5}>
            <AuthCard title={t('ForgottenPassword')}>
              {store.success && (
                <Alert variant="success" className="text-center">
                  {t('Passwordresetlinksent.Pleasecheckyouremail.')}
                </Alert>
              )}

              {store.error && <ErrorAlert message={store.error} onClose={() => (store.error = null)} />}

              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  store.submit(t);
                }}
              >
                <Form.Group controlId="formEmail" className="mb-3">
                  <Form.Label>{t('Emailaddress')}</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder={t('Enteryouremail')}
                    value={store.email}
                    onChange={(e) => store.setEmail(e.target.value)}
                    required
                    disabled={store.loading}
                    autoComplete="email"
                  />
                </Form.Group>

                <Button type="submit" variant="primary" className="w-100 py-2" disabled={store.loading}>
                  {store.loading ? (
                    <>
                      <Spinner size="sm" className="me-2" animation="border" role="status" aria-hidden="true" />
                      {t('Loading...')}
                    </>
                  ) : (
                    t('Submit')
                  )}
                </Button>
              </Form>
            </AuthCard>
          </Col>
        </Row>
      </main>

      <Footer />
    </Container>
  );
});

export default ForgotPassword;
