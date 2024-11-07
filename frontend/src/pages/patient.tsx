import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import authStore from '../stores/authStore';  // Import the authStore for access control
import Header from '../components/common/Header';  // Header component
import Footer from '../components/common/Footer';  // Footer component
import WelcomeArea from '../components/WelcomeArea';  // Welcome section component
import RecommendationList from '../components/RecommendationsList';  // List of recommendations
import { Container, Row, Col } from 'react-bootstrap';  // Responsive grid system

const PatientView: React.FC = observer(() => {
  const navigate = useNavigate();  // Used for navigation
  const [loading, setLoading] = useState(true); // Loading state to handle async checks

  useEffect(() => {
    // Check if the user is authenticated and has the "patient" role
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/unauthorized');  // Redirect to UnauthorizedAccess if not a patient
    } else {
      setLoading(false);  // If the user is authenticated, stop loading
    }
  }, [navigate]);

  // Show a loading message or spinner while authentication check is in progress
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      {/* Header Component */}
      <Header isLoggedIn={true} />

      {/* Main Content Section */}
      <Row className="flex-grow-1 justify-content-center p-4">
        <Col xs={12} md={8}>
          {/* Welcome Area */}
          <WelcomeArea user={'patient'} />

          {/* Recommendations Section */}
          <div className="mt-4">
            <RecommendationList/>
          </div>
        </Col>
      </Row>

        <Footer />
    </Container>

  );
});

export default PatientView;
