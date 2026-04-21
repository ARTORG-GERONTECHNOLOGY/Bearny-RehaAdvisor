import React from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import Card from '@/components/Card';
import CircleDashedFill from '@/assets/icons/circle-dashed-fill.svg?react';
import CircleCheckFill from '@/assets/icons/circle-check-fill.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';
import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';

interface InterventionItemProps {
  rec: PatientRec;
  date: Date;
  isBusy: boolean;
  onItemClick: (rec: PatientRec) => void;
  onToggleComplete: (
    e: React.MouseEvent | React.KeyboardEvent,
    rec: PatientRec,
    date: Date
  ) => void;
}

const InterventionItem: React.FC<InterventionItemProps> = ({
  rec,
  date,
  isBusy,
  onItemClick,
  onToggleComplete,
}) => {
  const { t } = useTranslation();

  const completed = patientInterventionsStore.isCompletedOn(rec, date);
  const title = rec.translated_title || rec.intervention_title || '';
  const duration = rec.duration || rec.intervention?.duration;
  const isExercise = rec.intervention?.aim?.toLowerCase() === 'exercise';

  return (
    <Card
      className="flex gap-3 hover:bg-accent focus:bg-accent transition-colors cursor-pointer"
      onClick={() => onItemClick(rec)}
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${completed ? t('Completed') : t('Not completed')}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onItemClick(rec);
        }
      }}
    >
      <div className="flex gap-3 flex-1 min-w-0">
        {isExercise ? (
          <ExerciseIcon className="flex-none w-8 h-8" aria-hidden="true" />
        ) : (
          <EducationIcon className="flex-none w-8 h-8" aria-hidden="true" />
        )}
        <div className="flex-1 flex gap-1 flex-col min-w-0">
          {typeof duration === 'number' && (
            <div className="font-medium text-sm leading-5 text-zinc-500">
              <span aria-label={t('Duration')}>{duration}</span>min
            </div>
          )}
          <div className="font-bold font-lg leading-5 text-zinc-800 break-words lg:line-clamp-2">
            {title}
          </div>
        </div>
      </div>
      <div
        className="flex-none"
        onClick={(e) => onToggleComplete(e, rec, date)}
        role="button"
        tabIndex={0}
        aria-label={completed ? t('Mark as incomplete') : t('Mark as complete')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleComplete(e, rec, date);
          }
        }}
      >
        {isBusy ? (
          <Skeleton className="w-8 h-8 rounded-full" />
        ) : completed ? (
          <CircleCheckFill className="w-8 h-8 text-success cursor-pointer" aria-hidden="true" />
        ) : (
          <CircleDashedFill className="w-8 h-8 text-zinc-200 cursor-pointer" aria-hidden="true" />
        )}
      </div>
    </Card>
  );
};

export default InterventionItem;
