// PatientView.tsx

import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import InterventionList from '../components/RecommendationsList';
import { Container, Row, Col, ButtonGroup, ToggleButton } from 'react-bootstrap';
import WelcomeArea from '../components/WelcomeArea';  // Welcome section component

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [viewType, setViewType] = useState('day'); // Day | Week | Month

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/patient_home');
    } else {
      setLoading(false);
    }
  }, [navigate]);

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={true} />
      <WelcomeArea user={'patient'} />
      {/* Main Content Section */}
      <Row className="flex-grow-1 justify-content-center p-4">
        <Col xs={12} md={8}>
          <InterventionList viewType={viewType} />
        </Col>
      </Row>

      <Footer />
    </Container>
  );
});

export default PatientView;
