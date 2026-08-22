import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PatientPopupStore } from '@/stores/patientPopupStore';
import {
  notificationPreferencesStore,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABEL_KEYS,
} from '@/stores/notificationPreferencesStore';
import { fmtDateTime } from '@/utils/patientStatus';

interface PatientInfoNotificationsCardProps {
  store: PatientPopupStore;
}

const PatientInfoNotificationsCard: React.FC<PatientInfoNotificationsCardProps> = observer(
  ({ store }) => {
    const { t } = useTranslation();
    // Not store.rawPatient.notification_preferences — that's a one-time snapshot and goes stale.
    const { preferences, deviceCount, lastSent } = notificationPreferencesStore;

    useEffect(() => {
      if (store.patientId) {
        notificationPreferencesStore.fetchPreferences(store.patientId);
      }
    }, [store.patientId]);

    return (
      <div className="mb-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('Notifications')}</CardTitle>
            <CardDescription>{t('Managed by the patient in their profile')}</CardDescription>
            {deviceCount !== null && (
              <div className={`text-xs ${deviceCount === 0 ? 'text-yellow' : 'text-zinc-500'}`}>
                {deviceCount === 0
                  ? t('No device registered')
                  : t('devicesRegisteredCount', { count: deviceCount })}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <TooltipProvider delayDuration={150}>
              <div className="flex flex-wrap gap-2">
                {NOTIFICATION_CATEGORIES.map((category) => {
                  const enabled = preferences[category] === true;
                  const lastSentAt = lastSent[category];
                  return (
                    <Tooltip key={category}>
                      <TooltipTrigger asChild>
                        <Badge variant={enabled ? 'dashboard-success' : 'dashboard'} tabIndex={0}>
                          {t(NOTIFICATION_CATEGORY_LABEL_KEYS[category])}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {lastSentAt
                          ? `${t('Last sent')}: ${fmtDateTime(lastSentAt)}`
                          : t('Never sent')}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
    );
  }
);

export default PatientInfoNotificationsCard;
