import React from 'react';
import { useTranslation } from 'react-i18next';
import ClockIcon from '@/assets/icons/interventions/clock.svg?react';
import { Badge } from '@/components/ui/badge';

type PatientLibraryInterventionCardItem = {
  duration?: string | number;
  content_type?: string;
  avg_rating?: number | null;
  rating_count?: number;
};

type PatientLibraryInterventionCardProps = {
  item: PatientLibraryInterventionCardItem;
  displayTitle: string;
  Icon: React.ComponentType<{ className?: string }>;
  contentTypeIcon: React.ComponentType<{ className?: string }> | null;
  containerClassName: string;
  onClick: () => void;
};

const PatientLibraryInterventionCard: React.FC<PatientLibraryInterventionCardProps> = ({
  item,
  displayTitle,
  Icon,
  contentTypeIcon: ContentTypeIcon,
  containerClassName,
  onClick,
}) => {
  const { t } = useTranslation();

  return (
    <div
      role="button"
      onClick={onClick}
      className={`${containerClassName} rounded-3xl border border-accent p-4 flex flex-col gap-6`}
    >
      <Icon className="shrink-0 w-8 h-8" />
      <div className="flex-1 flex flex-col gap-2 justify-between">
        <div className="font-bold text-lg leading-6 text-zinc-800">{displayTitle || '-'}</div>
        <div className="flex gap-1">
          <Badge className="flex gap-1 bg-white py-2 px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500">
            <ClockIcon className="w-4 h-4" />
            <div className="text-[#00956C] font-medium">
              {isNaN(Number(item.duration)) ? '-' : `${item.duration}min`}
            </div>
          </Badge>
          <Badge className="flex gap-1 bg-white py-2 px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500">
            {ContentTypeIcon && <ContentTypeIcon className="w-4 h-4" />}
            <div className="text-[#00956C] font-medium">{t(item.content_type) || '-'}</div>
          </Badge>
          {item.avg_rating != null && (
            <Badge className="flex gap-1 bg-white py-2 px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500">
              <span className="text-[#EFA73B]">
                {'★'.repeat(Math.round(item.avg_rating))}
                {'☆'.repeat(5 - Math.round(item.avg_rating))}
              </span>
              <span className="text-[#00956C] font-medium">{item.avg_rating.toFixed(1)}</span>
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientLibraryInterventionCard;
