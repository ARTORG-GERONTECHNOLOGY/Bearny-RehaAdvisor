import React, { useState, useEffect } from 'react';
import EditUserInfo from '../components/forms/EditTherapistInfo';
import DeleteConfirmation from '../components/DeleteConfirmation';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';
import { Button, Card, Col, Container, Row } from 'react-bootstrap'


const UserProfile: React.FC = () => {
  const navigate = useNavigate(); // Used for navigation
  const [isEditing, setIsEditing] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [userData, setUserData] = useState<any>(''); // Initialize with null to indicate loading state
  const [loading, setLoading] = useState(true); // To manage loading state
  const [error, setError] = useState(''); // To manage error state

  const therapistId = authStore.id;

  // Fetch user data on mount
    useEffect(() => {
      authStore.checkAuthentication();
  
      if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
        navigate('/');
      } else {
        setLoading(false);
      }
    }, [navigate]);

    useEffect(() => {
      if (authStore.isAuthenticated && authStore.userType === 'Therapist') {
        
        fetchData();
      }
    }, [therapistId]);
  
    const fetchData = async () => {
      try {
        const response = await apiClient.get(`users/${authStore.id}/profile`); // Fetch the user profile from the API
        setUserData(response.data);
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
        setError('Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };

  // Toggle editing mode
  const handleEditClick = () => {
    setIsEditing(!isEditing);
  };

  // Show delete confirmation popup
  const handleDeleteClick = () => {
    setShowDeletePopup(true);
  };

  // Save updated user info
  const handleSave = async (updatedUserData: any) => {
    try {
      const response = await apiClient.put(`/users/${authStore.id}/profile/`, updatedUserData); // Update user info via API
      setUserData(response.data); // Update the state with the new data
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update user profile:', err);
      setError('Failed to update profile');
    }
  };

  // Handle user account deletion
  const handleDeleteConfirm = async () => {
    try {
      await apiClient.delete(`/users/${authStore.id}/profile/`);
      authStore.deleteUser(); // Clear user session on the client side
      localStorage.clear(); // Clear localStorage
      navigate('/'); // Redirect to the homepage or login
    } catch (err) {
      console.error('Failed to delete user account:', err);
      setError('Failed to delete account');
    } finally {
      setShowDeletePopup(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <Container fluid className="d-flex flex-column vh-100">
      {/* Header */}
      <Header isLoggedIn={!!authStore.userType} />

      <Container className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card className="shadow-sm p-4">
              {/* Card Header */}
              <Card.Header className="bg-primary text-white text-center">
                <h2>User Profile</h2>
              </Card.Header>

              {/* Main Content */}
              <Card.Body>
                {error && <p className="text-danger text-center">{error}</p>}
                {!isEditing ? (
                  <>
                    <h4 className="mb-4 text-center">{userData.first_name} {userData.name}</h4>

                    <p>
                      <strong>Email:</strong> {userData.email}
                    </p>
                    <p>
                      <strong>Phone:</strong> {userData.phone}
                    </p>
                    <p>
                      <strong>User Type:</strong> {authStore.userType}
                    </p>

                    {/* Display user-specific fields based on userType */}
                    {authStore.userType === 'Therapist' && (
                      <>
                        <p>
                          <strong>Specialization:</strong>{' '}
                          {userData?.specializations ? userData.specializations.join(', ') : 'No specialization set'}
                        </p>
                        <p>
                          <strong>Clinics:</strong>{' '}
                          {userData?.clinics ? userData.clinics.join(', ') : 'No clinics set'}
                        </p>
                      </>
                    )}

                    <div className="d-flex justify-content-between mt-4">
                      <Button variant="primary" onClick={handleEditClick}>
                        Edit Info
                      </Button>
                      <Button variant="danger" onClick={handleDeleteClick}>
                        Delete Account
                      </Button>
                    </div>
                  </>
                ) : (
                  <EditUserInfo
                    userData={userData}
                    onSave={handleSave}
                    onCancel={() => setIsEditing(false)}
                  />
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Delete confirmation popup */}
      {showDeletePopup && (
        <DeleteConfirmation
          show={showDeletePopup}
          handleClose={() => setShowDeletePopup(false)}
          handleConfirm={handleDeleteConfirm}
        />
      )}

      {/* Footer */}
      <Footer />
    </Container>
  );
};

export default UserProfile;
