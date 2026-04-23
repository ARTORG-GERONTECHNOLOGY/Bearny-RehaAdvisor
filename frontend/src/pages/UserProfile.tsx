/**
 * UserProfile page  (/userprofile)
 *
 * Displays and allows editing of the currently logged-in therapist's profile.
 * Rendered as an MobX observer so it reacts to userProfileStore changes.
 *
 * Modes (controlled by userProfileStore.mode)
 * --------------------------------------------
 * 'view'           — ProfileDetails component; shows name, email, phone,
 *                    specializations, clinics.  Buttons: Edit Info, Change Password,
 *                    Delete Account.
 * 'editProfile'    — EditTherapistInfo component; allows updating name, first_name,
 *                    phone, specializations, clinics.  Email field is read-only.
 *                    Submits PUT /api/users/<id>/profile/ via userProfileStore.updateProfile().
 * 'changePassword' — ChangePasswordForm component; verifies old password, enforces
 *                    strength rules, submits PUT /api/users/<id>/profile/ with
 *                    oldPassword + newPassword.
 *
 * Status banners (translated at render time)
 * ------------------------------------------
 * errorBanner and successBanner are read from the store as stable i18n keys and
 * translated here so the store itself stays language-agnostic.
 *
 * Deletion flow
 * -------------
 * "Delete Account" opens DeleteConfirmation modal.  On confirm,
 * userProfileStore.deleteAccount() issues DELETE /api/users/<id>/profile/ (soft-delete:
 * isActive=False).  authStore.logout() runs automatically on success and the
 * user is redirected to '/'.
 *
 * Data flow
 * ---------
 * On mount: userProfileStore.fetchProfile() → GET /api/users/<id>/profile/
 * On save:  updateProfile() → PUT, then re-fetches via GET to ensure the modal
 *           always shows the latest server state.
 */

// src/pages/UserProfile.tsx
import React, { useEffect, useMemo } from 'react';
import { Card, Col, Container, Row, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import StatusBanner from '@/components/common/StatusBanner';
import EditUserInfo from '@/components/UserProfile/EditTherapistInfo';
import ChangePasswordForm from '@/components/UserProfile/ChangePasswordForm';
import DeleteConfirmation from '@/components/UserProfile/DeleteConfirmation';
import ProfileDetails from '@/components/UserProfile/ProfileDetails';
import Layout from '@/components/Layout';
import LanguageSelectorCard from '@/components/UserProfile/LanguageSelectorCard';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';

import authStore from '@/stores/authStore';
import userProfileStore from '@/stores/userProfileStore';

import LogoutFill from '@/assets/icons/logout-fill.svg?react';
import { Button } from '@/components/ui/button';

const UserProfile: React.FC = observer(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // translate store banners at render-time (store keeps stable keys/messages)
  const errorBanner = useMemo(
    () => (userProfileStore.errorBanner ? t(userProfileStore.errorBanner) : ''),
    [t, userProfileStore.errorBanner]
  );
  const successBanner = useMemo(
    () => (userProfileStore.successBanner ? t(userProfileStore.successBanner) : ''),
    [t, userProfileStore.successBanner]
  );

  useEffect(() => {
    authStore.checkAuthentication();

    if (!authStore.isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    document.title = t('User Profile') || 'User Profile';
    userProfileStore.fetchProfile();
  }, [navigate, t]);

  const renderModeTitle = () => {
    if (userProfileStore.mode === 'editProfile') return t('Edit Info');
    if (userProfileStore.mode === 'changePassword') return t('Change Password');
    return t('User Profile');
  };

  const onDeleteConfirmed = async () => {
    await userProfileStore.deleteAccount();
    // if delete succeeded, authStore.logout already ran; go home
    if (!userProfileStore.errorBanner) {
      navigate('/', { replace: true });
    }
  };

  const handleLogout = async () => {
    await authStore.logout();
    navigate('/');
  };

  return (
    <Layout>
      <PageHeader title={userProfileStore.userData?.first_name || t('User Profile')} />
      <div className="mt-8 grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-start">
        <Section>
          <LanguageSelectorCard />
        </Section>
        <Section>Data</Section>
        <Section>
          <Button variant="secondary" onClick={handleLogout}>
            {t('Logout')}
            <LogoutFill />
          </Button>
        </Section>
      </div>

      <StatusBanner type="danger" message={errorBanner} onClose={userProfileStore.clearError} />
      <StatusBanner
        type="success"
        message={successBanner}
        onClose={userProfileStore.clearSuccess}
      />

      <Container className="my-5 flex-grow-1">
        <Row className="justify-content-center">
          <Col xs={12} md={10} lg={8} xl={6}>
            <Card className="shadow-sm">
              <Card.Header className="bg-primary text-white text-center">
                <h2 className="mb-0">{renderModeTitle()}</h2>
              </Card.Header>

              <Card.Body>
                {userProfileStore.loading ? (
                  <div className="text-center my-4">
                    <Spinner animation="border" />
                    <p className="mt-3">{t('Loading')}...</p>
                  </div>
                ) : userProfileStore.userData ? (
                  userProfileStore.mode === 'editProfile' ? (
                    <EditUserInfo
                      userData={userProfileStore.userData}
                      onCancel={() => userProfileStore.setMode('view')}
                    />
                  ) : userProfileStore.mode === 'changePassword' ? (
                    <ChangePasswordForm onCancel={() => userProfileStore.setMode('view')} />
                  ) : (
                    <ProfileDetails
                      userData={userProfileStore.userData}
                      deleting={userProfileStore.deleting}
                      onEdit={() => userProfileStore.setMode('editProfile')}
                      onChangePassword={() => userProfileStore.setMode('changePassword')}
                      onDelete={userProfileStore.openDelete}
                    />
                  )
                ) : (
                  <div className="text-center text-muted">{t('No user data found.')}</div>
                )}
              </Card.Body>

              {(userProfileStore.mode === 'editProfile' ||
                userProfileStore.mode === 'changePassword') && (
                <Card.Footer className="bg-light">
                  <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                    <small className="text-muted">
                      {userProfileStore.mode === 'editProfile'
                        ? t('Update your profile information.')
                        : t('Change your account password.')}
                    </small>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => userProfileStore.setMode('view')}
                      disabled={userProfileStore.saving}
                    >
                      {t('Back')}
                    </Button>
                  </div>
                </Card.Footer>
              )}
            </Card>
          </Col>
        </Row>
      </Container>

      <DeleteConfirmation
        show={userProfileStore.showDeletePopup}
        handleClose={userProfileStore.closeDelete}
        handleConfirm={onDeleteConfirmed}
        isLoading={userProfileStore.deleting}
      />
    </Layout>
  );
});

export default UserProfile;
