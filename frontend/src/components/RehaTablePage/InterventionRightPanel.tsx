// src/components/RehaTablePage/InterventionRightPanel.tsx
import React from 'react';
import { Card, Row, Col, Form, Button } from 'react-bootstrap';
import { FaDownload } from 'react-icons/fa';
import { TFunction } from 'i18next';

import { Intervention } from '../../types';
import InterventionCalendar from './InterventionCalendar';

interface RightPanelData {
  interventions: Intervention[];
}

interface RightPanelExportState {
  exportStart: string;
  exportEnd: string;
  setExportStart: (v: string) => void;
  setExportEnd: (v: string) => void;
  exportScheduleCSV: () => void;
}

interface RightPanelActions {
  onSelectEvent: (event: any) => void;
}

interface InterventionRightPanelProps {
  data: RightPanelData;
  exportState: RightPanelExportState;
  actions: RightPanelActions;
  t: TFunction;
}

const InterventionRightPanel: React.FC<InterventionRightPanelProps> = ({
  data,
  exportState,
  actions,
  t,
}) => {
  const { interventions } = data;
  const {
    exportStart,
    exportEnd,
    setExportStart,
    setExportEnd,
    exportScheduleCSV,
  } = exportState;
  const { onSelectEvent } = actions;

  return (
    <>
      {/* Export toolbar */}
      <Card className="mb-3">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col xs={12} md={3}>
              <Form.Label className="mb-1">
                {t('Export start')}
              </Form.Label>
              <Form.Control
                type="date"
                value={exportStart}
                max={exportEnd || undefined}
                onChange={(e) => setExportStart(e.target.value)}
              />
            </Col>
            <Col xs={12} md={3}>
              <Form.Label className="mb-1">
                {t('Export end')}
              </Form.Label>
              <Form.Control
                type="date"
                value={exportEnd}
                min={exportStart || undefined}
                onChange={(e) => setExportEnd(e.target.value)}
              />
            </Col>
            <Col xs={12} md="auto" className="mt-2 mt-md-0">
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    const now = Date.now();
                    const start = new Date(now - 30 * 86400000)
                      .toISOString()
                      .slice(0, 10);
                    const end = new Date(now + 30 * 86400000)
                      .toISOString()
                      .slice(0, 10);
                    setExportStart(start);
                    setExportEnd(end);
                  }}
                >
                  {t('±30 days')}
                </Button>
                <Button
                  variant="primary"
                  onClick={exportScheduleCSV}
                >
                  <FaDownload className="me-2" />{' '}
                  {t('Export schedule (CSV)')}
                </Button>
              </div>
            </Col>
          </Row>
          <Row className="mt-2">
            <Col>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                {t(
                  'The exported CSV includes all scheduled interventions within the selected date range.'
                )}
              </div>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Calendar */}
      <div className="flex-1 min-h-0" style={{ overflow: 'auto' }}>
        <InterventionCalendar
          interventions={interventions}
          onSelectEvent={onSelectEvent}
        />
      </div>
    </>
  );
};

export default InterventionRightPanel;
