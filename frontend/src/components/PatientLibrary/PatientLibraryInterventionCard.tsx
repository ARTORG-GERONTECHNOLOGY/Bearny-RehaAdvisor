import React from 'react';
import { useTranslation } from 'react-i18next';
import ClockIcon from '@/assets/icons/interventions/clock.svg?react';
import StarsIcon from '@/assets/icons/interventions/stars.svg?react';
import { Badge } from '@/components/ui/badge';
import Card from '@/components/Card';

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
    <Card role="button" onClick={onClick} className={`${containerClassName} flex flex-col gap-6`}>
      <Icon className="shrink-0 w-8 h-8" />
      <div className="flex-1 flex flex-col gap-2 justify-between">
        <div className="font-bold text-lg leading-6 text-zinc-800">{displayTitle || '-'}</div>
        <div className="flex gap-1">
          <Badge variant="card">
            <ClockIcon className="w-4 h-4" />
            <div>{isNaN(Number(item.duration)) ? '-' : `${item.duration}min`}</div>
          </Badge>
          <Badge variant="card">
            {ContentTypeIcon && <ContentTypeIcon className="w-4 h-4" />}
            <div>{t(item.content_type) || '-'}</div>
          </Badge>
          {item.avg_rating != null && (
            <Badge variant="card">
              <StarsIcon className="w-4 h-4" />
              <div>{item.avg_rating.toFixed(1)}</div>
            </Badge>
          )}
        </div>
      </div>
    </Card>
  );
};

export default PatientLibraryInterventionCard;
