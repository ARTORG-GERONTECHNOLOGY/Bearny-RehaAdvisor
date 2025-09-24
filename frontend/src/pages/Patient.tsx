// src/pages/PatientView.tsx
import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import ErrorAlert from '../components/common/ErrorAlert';
import authStore from '../stores/authStore';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import InterventionList from '../components/PatientPage/InterventionList';
import FitbitConnectButton from '../components/PatientPage/FitbitStatus';
import ActivitySummary from '../components/PatientPage/ActivitySummary';
import DailyVitalsPrompt from '../components/PatientPage/DailyVitalsPrompt';
const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  // LIFTED STATE
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
    } else {
      setLoading(false);
    }

    const status = searchParams.get('fitbit_status');
    if (status === 'error') setError('Fitbit connection failed.');
  }, [navigate]);

  if (loading) return null;

  return (
    <div className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={authStore.isAuthenticated} />
      <Container fluid className="d-flex flex-column min-vh-100 px-3 px-sm-4 px-md-5">

        {/* Welcome Section */}
        <Row className="my-4 justify-content-center">
          <Col xs={12}>
            <WelcomeArea user="patient" />
          </Col>
        </Row>

        {/* Fitbit Status */}
        <Row className="mb-4 justify-content-center">
          <Col xs={12} className="text-center">
            <FitbitConnectButton />
          </Col>
        </Row>
        {/* Daily vitals prompt (only shows if not filled today) */}
<Row className="mb-3 justify-content-center">
  <Col xs={12} sm={11} md={10} lg={8}>
    <DailyVitalsPrompt />
  </Col>
</Row>

        {/* Error Alert */}
        {error && (
          <Row className="mb-4 justify-content-center">
            <Col xs={11} sm={10} md={8} lg={6}>
              <ErrorAlert
                message={error}
                onClose={() => setError('')}
              />
            </Col>
          </Row>
        )}

        <Row className="mb-4 justify-content-center">
          <Col xs={12} sm={11} md={10} lg={8}>
            {/* Pass selectedDate */}
            <ActivitySummary selectedDate={selectedDate} />
          </Col>
        </Row>

        {/* Intervention List */}
        <Row className="flex-grow-1 justify-content-center">
          <Col xs={12} sm={11} md={10} lg={8}>
            {/* Control selectedDate from here */}
            <InterventionList
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
            />
          </Col>
        </Row>

        <Footer />
      </Container>
    </div>
  );
});

export default PatientView;
