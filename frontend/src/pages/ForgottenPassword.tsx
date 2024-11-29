import React, { useState } from 'react';
import { Alert, Button, Col, Container, Form, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import apiClient from '../api/client'; // Axios instance for API requests

const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState(''); // State to store email input
  const [error, setError] = useState<string | null>(null); // Error message state
  const [success, setSuccess] = useState(false); // Success state to show success message
  const { t } = useTranslation(); // Translation hook

  // Handle form submission for forgot password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form default submission

    try {
      // Send password reset request to the backend
      await apiClient.post('auth/forgot-password/', { email });
      setSuccess(true); // Show success message
      setError(null); // Clear previous errors if any
    } catch (error) {
      setError(t('Failed to send password reset link. Please try again.')); // Set error message
      setSuccess(false); // Hide success message
    }
  };

  return (
    <Container className="d-flex flex-column vh-100">
      {/* Header component, not logged in */}
      <Header isLoggedIn={false} />

      {/* Main Content */}
      <Row className="flex-grow-1 justify-content-center align-items-center w-100">
        <Col xs={12} md={6} lg={5} className="mx-auto">
          <h2 className="text-center mb-4">{t('Forgotten Password')}</h2>

          {/* Success Alert */}
          {success && (
            <Alert variant="success" className="text-center">
              {t('Password reset link sent. Please check your email.')}
            </Alert>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="danger" className="text-center">
              {error}
            </Alert>
          )}

          {/* Forgot Password Form */}
          <Form onSubmit={handleForgotPassword}>
            <Form.Group controlId="formEmail" className="mb-3">
              <Form.Label>{t('Email address')}</Form.Label>
              <Form.Control
                type="email"
                placeholder={t('Enter your email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Form.Group>

            {/* Submit Button */}
            <Button variant="primary" type="submit" className="w-100">
              {t('Submit')}
            </Button>
          </Form>
        </Col>
      </Row>

      {/* Footer Component */}
      <Footer />
    </Container>
  );
};

export default ForgotPassword;
