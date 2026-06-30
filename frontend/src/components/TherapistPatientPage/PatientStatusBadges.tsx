// src/components/TherapistPatientPage/PatientStatusBadges.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { PatientType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { chipClass, getAdherenceInfo, getFeedbackInfo, getLoginInfo } from '@/utils/patientStatus';

type Props = { patient: PatientType };

export const LoginBadge: React.FC<Props> = ({ patient }) => {
  const { t } = useTranslation();
  const { last, days, level } = getLoginInfo(patient);

  let badgeText = t('Never logged in');
  if (last) {
    if (days === 0) badgeText = t('today');
    else if (days === 1) badgeText = t('yesterday');
    else badgeText = t('daysAgoShort', { d: days });
  }

  return (
    <Badge variant="dashboard" className={`text-nowrap ${chipClass(level)}`}>
      {badgeText}
    </Badge>
  );
};

export const AdherenceProgress: React.FC<Props> = ({ patient }) => {
  const { rate, level } = getAdherenceInfo(patient);

  const indicatorClassName =
    level === 'bad' ? 'bg-nok' : level === 'warn' ? 'bg-yellow' : level === 'good' ? 'bg-ok' : '';

  const labelClassName =
    level === 'bad'
      ? 'text-nok'
      : level === 'warn'
        ? 'text-yellow'
        : level === 'good'
          ? 'text-ok'
          : 'text-chartMuted';

  return (
    <div className="flex items-center gap-2">
      <Progress
        value={rate ?? 0}
        max={100}
        indicatorClassName={indicatorClassName}
        className="w-10 h-1"
      />
      <span className={`text-xs font-medium ${labelClassName}`}>
        {rate != null ? `${rate}%` : '—'}
      </span>
    </div>
  );
};

export const FeedbackBadge: React.FC<Props> = ({ patient }) => {
  const { t } = useTranslation();
  const { daysSinceLast, lowRatings14d, level } = getFeedbackInfo(patient);

  let badgeText;
  if (level === 'unknown') {
    badgeText = t('No feedback');
  } else if (level === 'bad') {
    badgeText =
      lowRatings14d >= 7
        ? t('negRatingsShort', { n: lowRatings14d })
        : t('daysAgoShort', { d: daysSinceLast });
  } else if (level === 'warn') {
    badgeText =
      lowRatings14d >= 3
        ? t('negRatingsShort', { n: lowRatings14d })
        : t('daysAgoShort', { d: daysSinceLast });
  } else {
    badgeText = t('Good');
  }

  return (
    <Badge variant="dashboard" className={`text-nowrap ${chipClass(level)}`}>
      {badgeText}
    </Badge>
  );
};
