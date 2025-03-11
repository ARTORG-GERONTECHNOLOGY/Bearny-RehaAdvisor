import React, { useState, useEffect } from 'react';
import EditUserInfo from '../components/forms/EditTherapistInfo';
import DeleteConfirmation from '../components/DeleteConfirmation';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import authStore from '../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { t } from 'i18next';
import apiClient from '../api/client';
import { Button, Card, Col, Container, Row } from 'react-bootstrap';

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const therapistId = authStore?.id;

  // Check authentication on mount
  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    } else {
      setLoading(false);
    }
  }, [navigate]);

  // Fetch user data
  useEffect(() => {
    if (!therapistId) return; // Ensure therapist ID is available before fetching data
    if (authStore.isAuthenticated && authStore.userType === 'Therapist') {
      fetchData();
    }
  }, [therapistId]);

  const fetchData = async () => {
    try {
      const response = await apiClient.get(`/users/${authStore.id}/profile`);
      if (response?.data) {
        setUserData(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setError(t('Failed to load user profile'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = () => setIsEditing(!isEditing);
  const handleDeleteClick = () => setShowDeletePopup(true);

  const handleSave = async (updatedUserData: any) => {
    try {
      const response = await apiClient.put(`/users/${authStore.id}/profile/`, updatedUserData);
      if (response?.data) {
        setUserData(response.data);
      }
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update user profile:', err);
      setError(t('Failed to update profile'));
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      await apiClient.delete(`/users/${authStore.id}/profile/`);
      authStore.deleteUser();
      localStorage.clear();
      navigate('/');
    } catch (err) {
      console.error('Failed to delete user account:', err);
      setError(t('Failed to delete account'));
    } finally {
      setShowDeletePopup(false);
    }
  };

  // Return loading or error messages before rendering content
  if (loading) {
    return (
      <Container className="my-5 text-center">
        <p>{t('Loading')}...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="my-5 text-center">
        <p className="text-danger">{error}</p>
      </Container>
    );
  }

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      {/* Header */}
      <Header isLoggedIn={!!authStore.userType} />

      {/* Main Content */}
      <Container className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col md={8} lg={6}>
            <Card className="shadow-sm p-4">
              {/* Card Header */}
              <Card.Header className="bg-primary text-white text-center">
                <h2>{t('User Profile')}</h2>
              </Card.Header>

              {/* Main Content */}
              <Card.Body>
                {error && <p className="text-danger text-center">{error}</p>}
                {!isEditing ? (
                  <>
                    <h4 className="mb-4 text-center">
                      {userData?.first_name ?? 'N/A'} {userData?.name ?? 'N/A'}
                    </h4>

                    <p>
                      <strong>{t('Email')}:</strong> {userData?.email ?? 'N/A'}
                    </p>
                    <p>
                      <strong> {t('Phone')}:</strong> {userData?.phone ?? 'N/A'}
                    </p>
                    <p>
                      <strong>{t('User Type')}:</strong> {t(authStore.userType)}
                    </p>

                    {/* Display user-specific fields based on userType */}
                    {authStore.userType === 'Therapist' && (
                      <>
                        <p>
                          <strong>{t('Specialization')}:</strong>{' '}
                          {userData?.specializations
                            ? t(userData.specializations.join(', '))
                            : t('No specialization set')}
                        </p>
                        <p>
                          <strong> {t('Clinics')}:</strong>{' '}
                          {userData?.clinics ? t(userData.clinics.join(', ')) : t('No clinics set')}
                        </p>
                      </>
                    )}

                    <div className="d-flex justify-content-between mt-4">
                      <Button variant="primary" onClick={handleEditClick}>
                        {t('Edit Info')}
                      </Button>
                      <Button variant="danger" onClick={handleDeleteClick}>
                        {t('Delete Account')}
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
