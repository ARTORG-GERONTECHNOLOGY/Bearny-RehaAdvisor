import React from 'react';
import { useTranslation } from 'react-i18next';

import Card from '@/components/Card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserType } from '@/types';

type ProfileDetailsCardProps = {
  loading: boolean;
  userData: UserType | null;
  userType: string;
};

const ProfileDetailsCard: React.FC<ProfileDetailsCardProps> = ({ loading, userData, userType }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <Card className="flex flex-col items-start gap-2">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-4 w-24" />
      </Card>
    );
  }

  if (!userData) {
    return (
      <Card className="flex flex-col items-start gap-2">
        <div className="text-center text-muted">{t('No user data found.')}</div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col items-start gap-2">
      <div className="font-bold text-lg text-zinc-800">
        {userData.first_name} {userData.name}
      </div>
      <div>
        <div className="font-bold text-zinc-800">{t('Email')}</div>
        <div className="text-zinc-500 leading-none">{userData.email}</div>
      </div>
      <div>
        <div className="font-bold text-zinc-800">{t('Phone')}</div>
        <div className="text-zinc-500 leading-none">{userData.phone}</div>
      </div>

      {userType === 'Therapist' && (
        <>
          <div>
            <div className="font-bold text-zinc-800">{t('Specialization')}</div>
            <div className="text-zinc-500 leading-none">
              {userData.specializations?.length ? userData.specializations.join(', ') : t('None')}
            </div>
          </div>
          <div>
            <div className="font-bold text-zinc-800">{t('Clinic')}</div>
            <div className="text-zinc-500 leading-none">
              {userData.clinics?.length ? userData.clinics.join(', ') : t('None')}
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default ProfileDetailsCard;
