import React from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import DatePicker from 'react-datepicker';
import { useTranslation } from 'react-i18next';
import { ChartRes, ViewMode } from '../../../types/health';

type Props = {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  chartRes: ChartRes;
  setChartRes: (r: ChartRes) => void;
  startDate: Date | null;
  endDate: Date | null;
  setStartDate: (d: Date | null) => void;
  setEndDate: (d: Date | null) => void;
  goPrev: () => void;
  goNext: () => void;
};

const Filters: React.FC<Props> = ({
  viewMode, setViewMode, chartRes, setChartRes,
  startDate, endDate, setStartDate, setEndDate, goPrev, goNext,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <Row className="mb-3 justify-content-center">
        <Col xs="auto">
          <div className="d-flex align-items-center gap-3">
            <Button onClick={goPrev} variant="outline-primary" size="sm">&larr;</Button>
            <h6 className="fw-semibold text-muted mb-0">
              {startDate?.toLocaleDateString()} &mdash; {endDate?.toLocaleDateString()}
            </h6>
            <Button onClick={goNext} variant="outline-primary" size="sm">&rarr;</Button>
          </div>
        </Col>
      </Row>

      <Row className="mb-4 align-items-end">
        <Col md={3}>
          <Form.Group>
            <Form.Label className="fw-bold">{t('View Mode')}</Form.Label>
            <Form.Select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)}>
              <option value="weekly">{t('Weekly')}</option>
              <option value="monthly">{t('Monthly')}</option>
            </Form.Select>
          </Form.Group>
        </Col>

        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold">{t('Chart Resolution')}</Form.Label>
            <div className="btn-group">
              {(['daily','weekly','monthly'] as ChartRes[]).map(r => (
                <Button key={r} size="sm"
                        variant={chartRes === r ? 'primary' : 'outline-primary'}
                        onClick={() => setChartRes(r)}>
                  {t(r.charAt(0).toUpperCase() + r.slice(1))}
                </Button>
              ))}
            </div>
          </Form.Group>
        </Col>

        <Col md={1} className="text-center">
          <div className="fw-bold text-muted mb-2">{t('or')}</div>
        </Col>

        <Col md={4}>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="fw-bold">{t('From')}</Form.Label>
                <DatePicker selected={startDate} onChange={setStartDate} className="form-control" dateFormat="yyyy-MM-dd" />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label className="fw-bold">{t('To')}</Form.Label>
                <DatePicker selected={endDate} onChange={setEndDate} className="form-control" dateFormat="yyyy-MM-dd" />
              </Form.Group>
            </Col>
          </Row>
        </Col>
      </Row>
    </>
  );
};

export default Filters;
