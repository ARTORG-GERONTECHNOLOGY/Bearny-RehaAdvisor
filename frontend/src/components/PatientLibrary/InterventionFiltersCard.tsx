// src/pages/patient-library/InterventionFiltersCard.tsx
import React, { useMemo } from 'react';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';

type Option = { value: string; label: string };

type Props = {
  searchTerm: string;
  onSearchTerm: (v: string) => void;

  contentType: string;
  onContentType: (v: string) => void;
  contentTypeOptions: string[];

  tagFilter: string[];
  onTagFilter: (v: string[]) => void;
  tagOptions: string[];

  benefitForFilter: string[];
  onBenefitForFilter: (v: string[]) => void;
  benefitOptions: string[];

  loading: boolean;
  resultCount: number;

  onReset: () => void;
};

const InterventionFiltersCard: React.FC<Props> = ({
  searchTerm,
  onSearchTerm,
  contentType,
  onContentType,
  contentTypeOptions,
  tagFilter,
  onTagFilter,
  tagOptions,
  benefitForFilter,
  onBenefitForFilter,
  benefitOptions,
  loading,
  resultCount,
  onReset,
}) => {
  const { t } = useTranslation();

  const tagSelectOptions: Option[] = useMemo(
    () => tagOptions.map((tag) => ({ value: tag, label: t(tag) })),
    [tagOptions, t]
  );

  const benefitSelectOptions: Option[] = useMemo(
    () => benefitOptions.map((b) => ({ value: b, label: t(b) })),
    [benefitOptions, t]
  );

  return (
    <Card className="shadow-sm border-0">
      <Card.Body className="p-3 p-sm-4">
        <Row className="g-3">
          <Col xs={12}>
            <Form.Group controlId="searchInput">
              <Form.Control
                type="text"
                placeholder={t('Search Interventions')}
                value={searchTerm}
                onChange={(e) => onSearchTerm(e.target.value)}
              />
            </Form.Group>
          </Col>

          <Col xs={12}>
            <Form.Select value={contentType} onChange={(e) => onContentType(e.target.value)}>
              <option value="">{t('Filter by Content Type')}</option>
              {contentTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </Col>

          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={tagSelectOptions}
              value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
              onChange={(opts) => onTagFilter((opts || []).map((opt) => opt.value))}
              placeholder={t('Filter by Tags')}
            />
          </Col>

          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={benefitSelectOptions}
              value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
              onChange={(opts) => onBenefitForFilter((opts || []).map((opt) => opt.value))}
              placeholder={t('Filter by Benefit')}
            />
          </Col>

          <Col xs={12}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <Button variant="outline-secondary" size="sm" onClick={onReset}>
                {t('Reset filters')}
              </Button>

              <span className="text-muted small">
                {loading ? `${t('Loading')}...` : `${resultCount} ${t('items')}`}
              </span>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default InterventionFiltersCard;
