// src/components/TherapistPatientPage/PatientStatusBadges.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PatientType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Traffic,
  chipClass,
  fmtDateTime,
  getAdherenceInfo,
  getFeedbackInfo,
  getLoginInfo,
  getWearInfo,
} from '@/utils/patientStatus';

type Props = { patient: PatientType };

type StatusChipProps = {
  label: string;
  level: Traffic;
  tip: string;
  children: React.ReactNode;
};

const StatusChip: React.FC<StatusChipProps> = ({ label, level, tip, children }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <span className="relative inline-block">
      <Badge
        variant="dashboard"
        className={`text-nowrap ${chipClass(level)}`}
        aria-label={`${label} ${level}`}
        onMouseOver={() => setHovered(true)}
        onMouseOut={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        tabIndex={0}
      >
        {children}
      </Badge>
      {hovered && tip && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-max max-w-xs whitespace-pre-line rounded bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg">
          {tip}
        </div>
      )}
    </span>
  );
};

export const LoginBadge: React.FC<Props> = ({ patient }) => {
  const { t } = useTranslation();
  const { last, days, level } = getLoginInfo(patient);

  let badgeText = t('Never logged in');
  if (last) {
    if (days === 0) badgeText = t('today');
    else if (days === 1) badgeText = t('yesterday');
    else badgeText = t('daysAgoShort', { d: days });
  }

  const tip = last
    ? `${t('Last login')}: ${fmtDateTime(last)} (${days} ${t('days ago')})`
    : String(t('Never logged in'));

  return (
    <StatusChip label={String(t('Login'))} level={level} tip={tip}>
      {badgeText}
    </StatusChip>
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
  const { lastAnsweredAt, daysSinceLast, lowRatings14d, level } = getFeedbackInfo(patient);

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

  const daysStr = daysSinceLast != null ? ` (${daysSinceLast} ${t('days ago')})` : '';
  const tip =
    level === 'unknown'
      ? String(t('No feedback ever submitted'))
      : [
          `${t('Last star rating')}: ${fmtDateTime(lastAnsweredAt)}${daysStr}`,
          `${t('Low ratings (≤2 stars) in last 14 days')}: ${lowRatings14d}`,
        ].join(' • ');

  return (
    <StatusChip label={String(t('Feedback'))} level={level} tip={tip}>
      {badgeText}
    </StatusChip>
  );
};

export const WearBadge: React.FC<Props> = ({ patient }) => {
  const { t } = useTranslation();
  const { level, daysSinceWorn, avgMin, revoked } = getWearInfo(patient);

  if (level === 'unknown') {
    return (
      <StatusChip label={String(t('Wear'))} level={level} tip={String(t('No Fitbit data'))}>
        {String(t('No data'))}
      </StatusChip>
    );
  }

  if (revoked) {
    return (
      <StatusChip
        label={String(t('Fitbit'))}
        level={level}
        tip={String(t('Fitbit disconnected — reconnect required'))}
      >
        {String(t('Disconnected'))}
      </StatusChip>
    );
  }

  const parts: string[] = [];
  if (daysSinceWorn !== null) {
    if (daysSinceWorn >= 2) {
      parts.push(`${t('Not worn for')} ${daysSinceWorn} ${t('days')}`);
    } else {
      parts.push(`${t('Last worn')}: ${daysSinceWorn === 0 ? t('today') : t('yesterday')}`);
    }
  }
  if (avgMin !== null) {
    const avgH = (avgMin / 60).toFixed(1);
    parts.push(`${t('Avg wear')}: ${avgH}h ${t('(30d)')}`);
  }
  const tip = parts.join(' • ');

  const avgHoursText = avgMin !== null ? `${(avgMin / 60).toFixed(1)}h` : null;

  let badgeText: string;
  if (level === 'bad') {
    badgeText = daysSinceWorn !== null ? t('daysAgoShort', { d: daysSinceWorn }) : t('Wear');
  } else if (level === 'warn') {
    badgeText = avgHoursText ?? t('Wear');
  } else if (daysSinceWorn === 0) {
    badgeText = t('today');
  } else if (daysSinceWorn === 1) {
    badgeText = t('yesterday');
  } else {
    badgeText = avgHoursText ?? t('Wear');
  }

  return (
    <StatusChip label={String(t('Wear'))} level={level} tip={tip}>
      {badgeText}
    </StatusChip>
  );
};
