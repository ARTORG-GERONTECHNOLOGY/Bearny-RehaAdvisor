import React, { useEffect, useState } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';

const TermsAndConditions: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    authStore.checkAuthentication();
  }, []);

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <Container fluid className="flex-grow-1 px-3 px-sm-4 py-5">
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8}>
            <Card className="shadow-sm p-4">
              <Card.Body>
                <h1 className="mb-4">{t('Terms and Conditions')}</h1>

                <p className="mb-4">
                  {t(
                    'This web application is provided for research purposes only. By accessing or using this platform, you agree to the following terms.'
                  )}
                </p>

                <h4 className="mt-4">{t('1. Research Use')}</h4>
                <p>
                  {t(
                    'The application is designed to support clinical and rehabilitation research. It is not intended for commercial use or general medical diagnosis.'
                  )}
                </p>

                <h4 className="mt-4">{t('2. Data Privacy')}</h4>
                <p>
                  {t(
                    'All user data collected through this platform is handled in accordance with ethical research guidelines and applicable data protection regulations.'
                  )}
                </p>

                <h4 className="mt-4">{t('3. No Guarantees')}</h4>
                <p>
                  {t(
                    'The application is provided "as is" without warranties of any kind. We make no guarantees regarding accuracy, reliability, or availability.'
                  )}
                </p>

                <h4 className="mt-4">{t('4. Consent')}</h4>
                <p>
                  {t(
                    'By using this platform, you consent to your data being used for scientific and academic purposes, in anonymized form.'
                  )}
                </p>

                <h4 className="mt-4">{t('5. Changes')}</h4>
                <p>
                  {t(
                    'These terms may be updated periodically. Continued use of the application implies acceptance of the revised terms.'
                  )}
                </p>

                <p className="mt-5 text-muted fst-italic">
                  {t('If you have any questions or concerns, please contact the research team.')}
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      <Footer />
    </div>
  );
};

export default TermsAndConditions;
