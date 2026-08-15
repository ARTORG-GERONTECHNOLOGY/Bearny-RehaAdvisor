import React from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL_KEYS,
} from '@/stores/notificationPreferencesStore';

interface PatientInfoNotificationsCardProps {
  store: PatientPopupStore;
}

const PatientInfoNotificationsCard: React.FC<PatientInfoNotificationsCardProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();
    const preferences = store.rawPatient?.notification_preferences ?? {};

    return (
      <div className="mb-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Notifications')}</CardTitle>
            <CardDescription>{t('Managed by the patient in their profile')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_CATEGORIES.map((category) => {
                const enabled = preferences[category] === true;
                return (
                  <Badge key={category} variant={enabled ? 'dashboard-success' : 'dashboard'}>
                    {t(NOTIFICATION_CATEGORY_LABEL_KEYS[category])}
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
);

export default PatientInfoNotificationsCard;
