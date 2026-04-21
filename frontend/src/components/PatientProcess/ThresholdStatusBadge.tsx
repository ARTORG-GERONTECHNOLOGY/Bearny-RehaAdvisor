import React from 'react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CircleXFill from '@/assets/icons/circle-xmark-fill.svg?react';
import { useTranslation } from 'react-i18next';
import type { ThresholdStatus } from '@/hooks/usePatientProcess';

type Props = {
  status: ThresholdStatus;
};

const ThresholdStatusBadge: React.FC<Props> = ({ status }) => {
  const { t } = useTranslation();
  if (status === null) return null;

  const color =
    status === 'green' ? 'text-success' : status === 'yellow' ? 'text-yellow' : 'text-error';

  return (
    <div className={`flex gap-2 ${color}`}>
      <div className="font-bold text-lg">
        {status === 'green' ? t('Reached') : t('Not reached')}
      </div>
      {status === 'green' ? (
        <CircleCheckFill className="w-8 h-8" />
      ) : (
        <CircleXFill className="w-8 h-8" />
      )}
    </div>
  );
};

export default ThresholdStatusBadge;
