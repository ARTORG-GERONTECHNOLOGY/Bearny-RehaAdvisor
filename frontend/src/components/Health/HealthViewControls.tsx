// src/components/Health/HealthViewControls.tsx
import React from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import type { ChartRes, ViewMode } from '../../types/health';
import type { HealthPageStore } from '../../stores/healthPageStore';

type Props = {
  store: HealthPageStore;
  t: (k: string) => string;
  formatRangeLabel: (start: Date, end: Date) => string;
  onExportClick: () => void;
};

const HealthViewControls: React.FC<Props> = observer(
  ({ store, t, formatRangeLabel, onExportClick }) => {
    return (
      <Card className="shadow-sm">
        <Card.Body className="p-3 p-md-4">
          <Row className="g-3 align-items-end">
            <Col xs={12} lg={5}>
              <div className="d-flex align-items-center justify-content-between gap-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={store.goPrev}
                  aria-label={t('Previous')}
                >
                  ‹
                </Button>

                <div className="flex-grow-1 text-center fw-semibold">
                  {formatRangeLabel(store.viewStart, store.viewEnd)}
                </div>

                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={store.goNext}
                  aria-label={t('Next')}
                >
                  ›
                </Button>
              </div>
            </Col>

            <Col xs={12} sm={6} lg={3}>
              <Form.Label className="fw-semibold mb-1">{t('View Mode')}</Form.Label>
              <Form.Select
                value={store.viewMode}
                onChange={(e) => store.setViewMode(e.target.value as ViewMode)}
                aria-label={t('View Mode')}
              >
                <option value="weekly">{t('Weekly')}</option>
                <option value="monthly">{t('Monthly')}</option>
              </Form.Select>
            </Col>

            <Col xs={12} sm={6} lg={3}>
              <Form.Label className="fw-semibold mb-1">{t('Chart Resolution')}</Form.Label>
              <div className="btn-group w-100" role="group" aria-label={t('Chart resolution')}>
                {(['daily', 'weekly', 'monthly'] as ChartRes[]).map((r) => (
                  <Button
                    key={r}
                    size="sm"
                    className="text-capitalize"
                    variant={store.chartRes === r ? 'primary' : 'outline-primary'}
                    onClick={() => store.setChartRes(r)}
                  >
                    {t(r.charAt(0).toUpperCase() + r.slice(1))}
                  </Button>
                ))}
              </div>
            </Col>

            <Col xs={12} lg={1} className="text-lg-end">
              <Button variant="primary" className="w-100 w-lg-auto" onClick={onExportClick}>
                <i className="bi bi-box-arrow-up-right me-1" />
                {t('Export…')}
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    );
  }
);

export default HealthViewControls;
