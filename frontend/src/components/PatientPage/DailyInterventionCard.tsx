import React from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { observer } from 'mobx-react-lite';
import Section from '@/components/Section';
import Card from '@/components/Card';
import { Badge } from '@/components/ui/badge';
import InterventionItem from '@/components/PatientPage/InterventionItem';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';
import { useInterventions } from '@/hooks/useInterventions';
import type { Locale } from 'date-fns';
import EmptyIcon from '@/assets/icons/interventions/empty.svg?react';
import { PatientDailyInterventionCardSkeleton } from '@/components/skeletons/PatientSkeleton';

interface DailyInterventionCardProps {
  date: Date;
  title?: string; // Custom title, if not provided will use formatted date
  locale?: Locale; // Locale for date formatting
  badgeText?: string; // Optional badge text to display (e.g., "Today", "1/2", or undefined for no badge)
  onOpenIntervention?: (rec: PatientRec, date: Date) => void;
}

const DailyInterventionCard: React.FC<DailyInterventionCardProps> = observer(
  ({ date, title, locale, badgeText, onOpenIntervention }) => {
    const { t } = useTranslation();
    const { sortedInterventions, toggleCompleted, isBusy } = useInterventions(date);

    // Handle toggle completion
    const handleToggleCompleted = async (
      e: React.MouseEvent | React.KeyboardEvent,
      rec: PatientRec,
      targetDate: Date
    ) => {
      e.stopPropagation();
      await toggleCompleted(rec, targetDate);
    };

    // Determine the header text
    const headerText =
      title || (locale ? format(date, 'EEEE, dd.MM.', { locale }) : format(date, 'EEEE, dd.MM.'));
    const ariaLabel =
      title ||
      (locale
        ? format(date, 'EEEE, dd. MMMM yyyy', { locale })
        : format(date, 'EEEE, dd. MMMM yyyy'));

    if (patientInterventionsStore.loading) {
      return <PatientDailyInterventionCardSkeleton />;
    }

    return (
      <Section aria-label={ariaLabel}>
        <div className="flex p-2 pl-4 justify-between w-full">
          <div className="text-lg font-medium text-zinc-500">{headerText}</div>
          {badgeText && <Badge variant="section">{badgeText}</Badge>}
        </div>

        {sortedInterventions.length > 0 ? (
          sortedInterventions.map((rec) => (
            <InterventionItem
              key={rec.intervention_id}
              rec={rec}
              date={date}
              isBusy={isBusy(rec, date)}
              onItemClick={() => onOpenIntervention?.(rec, date)}
              onToggleComplete={handleToggleCompleted}
            />
          ))
        ) : (
          <Card
            className="flex items-center bg-accent gap-3"
            role="status"
            aria-label={t('No recommendation')}
          >
            <EmptyIcon className="flex-none w-8 h-8" aria-hidden="true" />
            <div className="flex-1 font-bold text-lg leading-5 text-zinc-400">
              {t('No recommendation')}
            </div>
          </Card>
        )}
      </Section>
    );
  }
);

export default DailyInterventionCard;
