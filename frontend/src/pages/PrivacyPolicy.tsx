import React, { useEffect, useState } from 'react';
import { Button, Col, Container, Row } from 'react-bootstrap';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import LoginForm from '../components/HomePage/LoginForm';
import { useTranslation } from 'react-i18next';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const toggleLoginModal = () => setShowLoginModal((prev) => !prev);

  useEffect(() => {
    authStore.checkAuthentication();
    if (authStore.isAuthenticated || authStore.userType === 'Patient') {
      navigate('/patient');
    }
  }, [navigate]);

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <Container fluid className="flex-grow-1 px-3 px-sm-4 px-md-5 pt-4">
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8}>
            <h1 className="mb-4" aria-label="Privacy Policy">
              Privacy Policy
            </h1>
            <p>
              <strong>Effective Date:</strong> May 9, 2025
            </p>

            <p>
              This web application is operated for <strong>research purposes only</strong>. We are
              committed to protecting your privacy and ensuring transparency in how your data is
              used.
            </p>

            <h4>1. Data Collection</h4>
            <p>We collect only the information necessary for research, such as:</p>
            <ul>
              <li>Basic demographic data (e.g., age, gender, education)</li>
              <li>Your responses to research-related questionnaires or activities</li>
              <li>Technical logs to maintain system integrity (e.g., IP address, device type)</li>
            </ul>
            <p>
              We do <strong>not</strong> collect personal identifiers such as names, addresses, or
              financial data unless explicitly requested and consented to.
            </p>

            <h4>2. Use of Data</h4>
            <p>
              Collected data is used <strong>solely for research and academic analysis</strong>. It
              will not be sold, rented, or shared for marketing purposes. All data is anonymized or
              pseudonymized before analysis where feasible.
            </p>

            <h4>3. Data Storage</h4>
            <p>
              Data is stored securely in compliance with ethical research standards. Access is
              limited to authorized research personnel only.
            </p>

            <h4>4. Consent</h4>
            <p>
              By using this application, you provide your <strong>informed consent</strong> to the
              collection and use of data as described in this policy. If you do not agree, please do
              not continue to use the application.
            </p>

            <h4>5. Your Rights</h4>
            <p>You may:</p>
            <ul>
              <li>Request to view the data you provided</li>
              <li>Withdraw from the study at any time</li>
              <li>Request deletion of your data (where identifiable)</li>
            </ul>
            <p>
              To exercise any of these rights, contact the research team through the contact form or
              email listed in the app.
            </p>

            <h4>6. Changes to This Policy</h4>
            <p>
              We may update this policy as needed to reflect legal or methodological changes. Any
              updates will be posted within the application.
            </p>
          </Col>
        </Row>
      </Container>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
