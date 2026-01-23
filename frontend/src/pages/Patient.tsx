import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import ErrorAlert from '../components/common/ErrorAlert';
import authStore from '../stores/authStore';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';

import InterventionList from '../components/PatientPage/InterventionList';
import FitbitConnectButton from '../components/PatientPage/FitbitStatus';
import ActivitySummary from '../components/PatientPage/ActivitySummary';
import DailyVitalsPrompt from '../components/PatientPage/DailyVitalsPrompt';

import { patientUiStore } from '../stores/patientUiStore';

import '../assets/styles/patient.css';

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  const fitbitStatus = useMemo(() => searchParams.get('fitbit_status'), [searchParams]);

  useEffect(() => {
    const check = async () => {
      await authStore.checkAuthentication();

      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
        return;
      }

      if (fitbitStatus === 'error') setPageError(t('Fitbit connection failed.'));
      setLoading(false);
    };

    check();
  }, [navigate, fitbitStatus, t]);

  if (loading) return null;

  return (
    <div className="d-flex flex-column min-vh-100 patient-root">
      <Header isLoggedIn={authStore.isAuthenticated} />

      <main className="flex-grow-1 patient-main">
        <Container fluid className="patient-container">
          <Row className="patient-section justify-content-center">
            <Col xs={12} sm={11} md={10} lg={8}>
              <WelcomeArea user="patient" />
            </Col>
          </Row>

          <Row className="patient-section justify-content-center">
            <Col xs={12} sm={11} md={10} lg={8} className="text-center">
              <FitbitConnectButton />
            </Col>
          </Row>

          <Row className="patient-section justify-content-center">
            <Col xs={12} sm={11} md={10} lg={8}>
              <DailyVitalsPrompt />
            </Col>
          </Row>

          {pageError && (
            <Row className="patient-section justify-content-center">
              <Col xs={12} sm={11} md={10} lg={8}>
                <ErrorAlert message={pageError} onClose={() => setPageError('')} />
              </Col>
            </Row>
          )}

          <Row className="patient-section justify-content-center">
            <Col xs={12} sm={11} md={10} lg={8}>
              <ActivitySummary selectedDate={patientUiStore.selectedDate} />
            </Col>
          </Row>

          <Row className="patient-section justify-content-center">
            <Col xs={12} sm={11} md={10} lg={8}>
              <InterventionList />
            </Col>
          </Row>
        </Container>
      </main>

      <Footer />
    </div>
  );
});

export default PatientView;
