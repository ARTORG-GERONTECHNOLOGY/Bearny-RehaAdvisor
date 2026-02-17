// src/components/UserProfile/ProfileDetails.tsx
import React from 'react';
import { Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import InfoBubble from '../common/InfoBubble';
import authStore from '../../stores/authStore';
import { UserType } from '../../types';

type Props = {
  userData: UserType;
  deleting: boolean;
  onEdit: () => void;
  onChangePassword: () => void;
  onDelete: () => void;
};

const ProfileDetails: React.FC<Props> = ({
  userData,
  deleting,
  onEdit,
  onChangePassword,
  onDelete,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <h4 className="text-center mb-4">
        {userData?.first_name} {userData?.name}
      </h4>

      <p>
        <strong>{t('Email')}:</strong> {userData?.email}
      </p>
      <p>
        <strong>{t('Phone')}:</strong> {userData?.phone}
      </p>

      {authStore.userType === 'Therapist' && (
        <>
          <p className="d-flex align-items-center gap-2 flex-wrap">
            <strong>{t('Specialization')}:</strong>{' '}
            <span>
              {userData?.specializations?.length ? userData.specializations.join(', ') : t('None')}
            </span>
            <InfoBubble tooltip={t('Therapist’s areas of clinical expertise')} />
          </p>

          <p className="d-flex align-items-center gap-2 flex-wrap">
            <strong>{t('Clinics')}:</strong>{' '}
            <span>{userData?.clinics?.length ? userData.clinics.join(', ') : t('None')}</span>
            <InfoBubble tooltip={t('Affiliated institutions')} />
          </p>
        </>
      )}

      <div className="d-flex justify-content-between mt-4 gap-2 flex-wrap">
        <Button variant="primary" onClick={onEdit}>
          {t('Edit Info')}
        </Button>

        <Button variant="outline-primary" onClick={onChangePassword}>
          {t('Change Password')}
        </Button>

        <Button variant="danger" onClick={onDelete} disabled={deleting}>
          {t('Delete Account')}
        </Button>
      </div>
    </>
  );
};

export default ProfileDetails;
