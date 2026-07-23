import React from 'react';
import InterventionList from '@/components/TherapistInterventionPage/InterventionList';
import type { InterventionTypeTh } from '@/types';

type Props = {
  loading: boolean;
  items: InterventionTypeTh[];
  onClick: (it: InterventionTypeTh) => void;
  t: (key: string) => string;
  translatedTitles: Record<string, { title: string; lang: string | null }>;
};

const LibraryListSection: React.FC<Props> = ({ loading, items, onClick, t, translatedTitles }) => {
  if (!loading && items.length === 0) {
    return (
      <div className="text-center text-muted-foreground">
        {t('No interventions match your filters.')}
      </div>
    );
  }

  return <InterventionList items={items} onClick={onClick} translatedTitles={translatedTitles} />;
};

export default LibraryListSection;
