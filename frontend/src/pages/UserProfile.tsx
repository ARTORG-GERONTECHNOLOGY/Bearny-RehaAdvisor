import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Container, Row, Spinner, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import EditUserInfo from '../components/UserProfile/EditTherapistInfo';
import DeleteConfirmation from '../components/UserProfile/DeleteConfirmation';
import authStore from '../stores/authStore';
import apiClient from '../api/client';
import { UserType } from '../types/index';

const UserProfile: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [isEditing, setIsEditing] = useState(false);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [userData, setUserData] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const therapistId = authStore?.id;

  useEffect(() => {
    authStore.checkAuthentication();
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
    } else {
      fetchUserProfile();
    }
  }, [navigate, therapistId]);

  const fetchUserProfile = async () => {
    try {
      const response = await apiClient.get<UserType>(`/users/${therapistId}/profile`);
      setUserData(response.data);
    } catch (err) {
      console.error('Profile fetch failed:', err);
      setError(t('Failed to load user profile'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updatedUserData: UserType) => {
    try {
      await apiClient.put<UserType>(`/users/${therapistId}/profile/`, updatedUserData);
      const response = await apiClient.get<UserType>(`/users/${therapistId}/profile`);
      setUserData(response.data);
      setIsEditing(false);
    } catch (err) {
      console.error('Profile update failed:', err);
      setError(t('Failed to update profile'));
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.delete(`/users/${therapistId}/profile/`);
      authStore.deleteUser();
      localStorage.clear();
      navigate('/');
    } catch (err) {
      console.error('Profile deletion failed:', err);
      setError(t('Failed to delete account'));
    } finally {
      setShowDeletePopup(false);
    }
  };

  const renderProfileDetails = () => (
    <>
      <h4 className="text-center mb-4">
        {userData?.first_name ?? 'N/A'} {userData?.name ?? 'N/A'}
      </h4>
      <p>
        <strong>{t('Email')}:</strong> {userData?.email ?? 'N/A'}
      </p>
      <p>
        <strong>{t('Phone')}:</strong> {userData?.phone ?? 'N/A'}
      </p>
      <p>
        <strong>{t('User Type')}:</strong> {t(authStore.userType)}
      </p>

      {authStore.userType === 'Therapist' && (
        <>
          <p>
            <strong>{t('Specialization')}:</strong>{' '}
            {userData?.specializations?.length
              ? userData.specializations.map(t).join(', ')
              : t('No specialization set')}
          </p>
          <p>
            <strong>{t('Clinics')}:</strong>{' '}
            {userData?.clinics?.length ? userData.clinics.join(', ') : t('No clinics set')}
          </p>
        </>
      )}

      <div className="d-flex justify-content-between mt-4">
        <Button variant="primary" onClick={() => setIsEditing(true)}>
          {t('Edit Info')}
        </Button>
        <Button variant="danger" onClick={() => setShowDeletePopup(true)}>
          {t('Delete Account')}
        </Button>
      </div>
    </>
  );

  return (
    <Container fluid className="d-flex flex-column min-vh-100">
      <Header isLoggedIn={!!authStore.userType} />

      <Container className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8} xl={6}>
            <Card className="shadow-sm">
              <Card.Header className="bg-primary text-white text-center">
                <h2>{t('User Profile')}</h2>
              </Card.Header>
              <Card.Body>
                {loading && (
                  <div className="text-center my-4">
                    <Spinner animation="border" role="status" />
                    <p className="mt-3">{t('Loading')}...</p>
                  </div>
                )}

                {error && (
                  <Alert variant="danger" className="text-center">
                    {error}
                  </Alert>
                )}

                {!loading && !isEditing && userData && renderProfileDetails()}

                {!loading && isEditing && userData && (
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

      {/* Delete Confirmation Modal */}
      {showDeletePopup && (
        <DeleteConfirmation
          show={showDeletePopup}
          handleClose={() => setShowDeletePopup(false)}
          handleConfirm={handleDelete}
        />
      )}

      <Footer />
    </Container>
  );
};

export default UserProfile;
