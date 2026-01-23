import React from 'react';
import { Row, Col } from 'react-bootstrap';
import InterventionList from '../TherapistInterventionPage/InterventionList';
import type { InterventionTypeTh } from '../../types';

type Props = {
  loading: boolean;
  items: InterventionTypeTh[];
  onClick: (it: InterventionTypeTh) => void;
  t: any;
  tagColors: any;
  translatedTitles: Record<string, { title: string; lang: string | null }>;
};

const LibraryListSection: React.FC<Props> = ({
  loading,
  items,
  onClick,
  t,
  tagColors,
  translatedTitles,
}) => {
  return (
    <Row>
      <Col xs={12}>
        {/* If you want a loading UI, this is where it goes */}
        <InterventionList
          items={items}
          onClick={onClick}
          t={t}
          tagColors={tagColors}
          translatedTitles={translatedTitles}
        />
        {!loading && items.length === 0 && (
          <div className="text-muted small mt-2">{t('No interventions match your filters.')}</div>
        )}
      </Col>
    </Row>
  );
};

export default LibraryListSection;
