// src/components/RehaTablePage/InterventionHeader.tsx
import React from 'react';
import { Row, Col, Nav } from 'react-bootstrap';
import { TFunction } from 'i18next';
import ErrorAlert from '../common/ErrorAlert';

interface InterventionHeaderProps {
  patientName: string;
  adherence: {
    last7: string;
    overall: string;
  };
  error: string;
  onClearError: () => void;
  topTab: 'interventions' | 'questionnaires';
  setTopTab: (tab: 'interventions' | 'questionnaires') => void;
  t: TFunction;
}

const InterventionHeader: React.FC<InterventionHeaderProps> = ({
  patientName,
  adherence,
  error,
  onClearError,
  topTab,
  setTopTab,
  t,
}) => {
  return (
    <>
      <Row>
        <Col>
          <h2 className="text-center mb-4">{patientName}</h2>
        </Col>
      </Row>

      <Row className="mb-3 justify-content-center">
        <Col md="auto" className="text-center">
          <div className="text-muted">
            <strong>{t('Adherence')}</strong>:&nbsp;
            {t('last 7 days')}: <span className="fw-semibold">{adherence.last7}</span>
            &nbsp;·&nbsp;
            {t('overall')}: <span className="fw-semibold">{adherence.overall}</span>
          </div>
        </Col>
      </Row>

      {error && (
        <Row>
          <Col>
            <ErrorAlert message={error} onClose={onClearError} />
          </Col>
        </Row>
      )}

      <Row className="mb-3">
        <Col>
          <Nav
            variant="tabs"
            activeKey={topTab}
            onSelect={(k) => setTopTab((k as any) || 'interventions')}
          >
            <Nav.Item>
              <Nav.Link eventKey="interventions">{t('Interventions')}</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="questionnaires">{t('Questionnaires')}</Nav.Link>
            </Nav.Item>
          </Nav>
        </Col>
      </Row>
    </>
  );
};

export default InterventionHeader;
