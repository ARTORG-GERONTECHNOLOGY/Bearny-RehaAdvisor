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

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/patient_home');
    } else {
      setLoading(false);
    }
    const status = searchParams.get('fitbit_status');
    if (status === 'error') setError('Fitbit connection failed.');
  }, [navigate]);

  if (loading) return null;

  return (
    <Container fluid className="d-flex flex-column min-vh-100 px-3 px-md-4">
      <Header isLoggedIn={true} />

      {/* Welcome Section */}
      <Row className="my-4 justify-content-center text-center">
        <Col xs={12}>
          <WelcomeArea user="patient" />
        </Col>
      </Row>
      <Row className="my-4 justify-content-center text-center">
        <Col xs={12}>
        <FitbitConnectButton />
        </Col>
      </Row>
      <Row className="my-4 justify-content-center text-center">
        <Col xs={9}>
        {error && (
                <ErrorAlert
                  message={error}
                  onClose={() => {
                    setError('');
                  }}
                />
              )}
        </Col>
      </Row>

      {/* Intervention List */}
      <Row className="flex-grow-1 justify-content-center">
        <Col xs={12} md={10} lg={8}>
          <InterventionList />
        </Col>
      </Row>

      <Footer />
    </Container>
  );
});

export default PatientView;
