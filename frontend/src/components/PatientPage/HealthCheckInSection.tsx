import React from 'react';
import { useTranslation } from 'react-i18next';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import CircleDashedFill from '@/assets/icons/circle-dashed-fill.svg?react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface HealthCheckInSectionProps {
  loading?: boolean;
  selectedDateLabel: string;
  weightKg?: number | null;
  bpSys?: number | null;
  bpDia?: number | null;
  onOpenWeightEntry: () => void;
  onOpenBloodPressureEntry: () => void;
}

const HealthCheckInSection: React.FC<HealthCheckInSectionProps> = ({
  loading,
  selectedDateLabel,
  weightKg,
  bpSys,
  bpDia,
  onOpenWeightEntry,
  onOpenBloodPressureEntry,
}) => {
  const { t } = useTranslation();

  const hasWeightEntry = weightKg != null;
  const hasBloodPressureEntry = bpSys != null && bpDia != null;
  const checkInEntries = [hasWeightEntry, hasBloodPressureEntry];
  const checkInEnteredCount = checkInEntries.filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
        <div className="p-2 pl-4 text-lg font-medium text-zinc-500">{t('CheckIn')}</div>
        <Skeleton className="w-full h-[200px] rounded-3xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 bg-white rounded-[40px] p-4">
      <div className="flex p-2 pl-4 justify-between w-full">
        <div className="text-lg font-medium text-zinc-500">{t('CheckIn')}</div>
        <Badge className="font-medium text-zinc-500 rounded-full py-[6px] px-3 border-none bg-zinc-50 shadow-none">
          {checkInEnteredCount} / {checkInEntries.length}
        </Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div
          role="button"
          className="flex-1 p-4 border border-accent rounded-3xl flex flex-col gap-4 justify-between"
          onClick={onOpenWeightEntry}
        >
          <div className="flex justify-between">
            <div>
              <div className="font-bold text-lg text-zinc-800">{t('WeightLabel')}</div>
              <div className="font-medium text-sm text-zinc-500">{selectedDateLabel}</div>
            </div>
            <div className="w-8 h-8 shrink-0">
              {hasWeightEntry ? (
                <CircleCheckFill className="w-full h-full text-green-600" />
              ) : (
                <CircleDashedFill className="w-full h-full text-zinc-200" />
              )}
            </div>
          </div>

          <div className="font-bold text-[28px] text-zinc-900">
            {weightKg || '--'} {t('WeightUnit').toLocaleLowerCase()}
          </div>
        </div>

        <div
          role="button"
          className="flex-1 p-4 border border-accent rounded-3xl flex flex-col gap-4 justify-between"
          onClick={onOpenBloodPressureEntry}
        >
          <div className="flex justify-between">
            <div>
              <div className="font-bold text-lg text-zinc-800">{t('Blood pressure')}</div>
              <div className="font-medium text-sm text-zinc-500">{selectedDateLabel}</div>
            </div>
            <div className="w-8 h-8 shrink-0">
              {hasBloodPressureEntry ? (
                <CircleCheckFill className="w-full h-full text-green-600" />
              ) : (
                <CircleDashedFill className="w-full h-full text-zinc-200" />
              )}
            </div>
          </div>

          <div className="font-bold text-[28px] text-zinc-900">
            {bpSys || '--'}
            <br />/{bpDia || '--'} mmHg
          </div>
        </div>
      </div>
    </div>
  );
};

export default HealthCheckInSection;
