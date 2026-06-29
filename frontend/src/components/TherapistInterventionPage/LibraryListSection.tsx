import React from 'react';
import { Row, Col } from 'react-bootstrap';
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
      <div className="text-center text-muted">{t('No interventions match your filters.')}</div>
    );
  }

  return (
    <Row>
      <Col xs={12}>
        <InterventionList
          items={items}
          onClick={onClick}
          t={t}
          translatedTitles={translatedTitles}
        />
      </Col>
    </Row>
  );
};

export default LibraryListSection;
