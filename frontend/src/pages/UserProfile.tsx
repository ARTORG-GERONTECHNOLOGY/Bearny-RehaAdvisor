// src/pages/UserProfile.tsx
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import StatusBanner from '@/components/common/StatusBanner';
import EditProfileSheet from '@/components/UserProfile/EditProfileSheet';
import DeleteConfirmationSheet from '@/components/UserProfile/DeleteConfirmationSheet';
import Layout from '@/components/Layout';
import LanguageSelectorCard from '@/components/UserProfile/LanguageSelectorCard';
import ProfileDetailsCard from '@/components/UserProfile/ProfileDetailsCard';
import PageHeader from '@/components/PageHeader';
import Section from '@/components/Section';

import authStore from '@/stores/authStore';
import userProfileStore from '@/stores/userProfileStore';

import LogoutFill from '@/assets/icons/logout-fill.svg?react';
import { Button } from '@/components/ui/button';
import ChangePasswordSheet from '@/components/UserProfile/ChangePasswordSheet';

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

    userProfileStore.fetchProfile();
  }, [navigate, t]);

  const handleLogout = async () => {
    await authStore.logout();
    navigate('/');
  };

  const onDeleteConfirmed = async () => {
    await userProfileStore.deleteAccount();
    // if delete succeeded, authStore.logout already ran; go home
    if (!userProfileStore.errorBanner) {
      navigate('/', { replace: true });
    }
  };

  return (
    <Layout>
      <PageHeader title={t('User Profile')} />

      <div className="mt-8 grid grid-cols-1 gap-2 lg:grid-cols-3 lg:items-start">
        <Section>
          <LanguageSelectorCard />
        </Section>
        <Section>
          <ProfileDetailsCard
            loading={userProfileStore.loading}
            userData={userProfileStore.userData}
            userType={authStore.userType}
          />
          {userProfileStore.userData && (
            <Button onClick={userProfileStore.openEditProfile}>{t('Edit Info')}</Button>
          )}
          <Button onClick={userProfileStore.openChangePassword}>{t('Change Password')}</Button>
        </Section>
        <Section>
          <Button variant="secondary" onClick={handleLogout}>
            {t('Logout')}
            <LogoutFill />
          </Button>

          <Button
            variant="ghost"
            disabled={userProfileStore.deleting}
            onClick={userProfileStore.openDelete}
            className="text-nok p-0 h-auto"
          >
            {t('Delete Account')}
          </Button>
        </Section>
      </div>

      <StatusBanner type="danger" message={errorBanner} onClose={userProfileStore.clearError} />
      <StatusBanner
        type="success"
        message={successBanner}
        onClose={userProfileStore.clearSuccess}
      />

      {userProfileStore.userData && (
        <EditProfileSheet
          show={userProfileStore.showEditProfile}
          onCancel={userProfileStore.closeEditProfile}
          userData={userProfileStore.userData}
        />
      )}

      <ChangePasswordSheet
        show={userProfileStore.showChangePassword}
        onCancel={userProfileStore.closeChangePassword}
      />

      <DeleteConfirmationSheet
        show={userProfileStore.showDeletePopup}
        handleClose={userProfileStore.closeDelete}
        handleConfirm={onDeleteConfirmed}
        isLoading={userProfileStore.deleting}
      />
    </Layout>
  );
});

export default UserProfile;
