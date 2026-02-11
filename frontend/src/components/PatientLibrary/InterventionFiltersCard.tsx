// src/pages/patient-library/InterventionFiltersCard.tsx
import React, { useMemo } from 'react';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';

// ✅ NEW taxonomy config (patient filters should use the same source of truth)
import interventionsConfig from '../../config/interventions.json';

type Option = { value: string; label: string };

type Props = {
  searchTerm: string;
  onSearchTerm: (v: string) => void;

  contentType: string;
  onContentType: (v: string) => void;

  // ✅ NEW: aims separated from tags
  aimsFilter: string[];
  onAimsFilter: (v: string[]) => void;

  // ✅ tags (everything except aims)
  tagFilter: string[];
  onTagFilter: (v: string[]) => void;

  loading: boolean;
  resultCount: number;

  onReset: () => void;
};

const uniq = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));

const InterventionFiltersCard: React.FC<Props> = ({
  searchTerm,
  onSearchTerm,
  contentType,
  onContentType,
  aimsFilter,
  onAimsFilter,
  tagFilter,
  onTagFilter,
  loading,
  resultCount,
  onReset,
}) => {
  const { t } = useTranslation();

  const tx = (interventionsConfig as any)?.interventionsTaxonomy || {};

  const aims = useMemo(() => uniq(tx.aims), [tx]);
  const contentTypes = useMemo(() => uniq(tx.content_types), [tx]);
  const frequencyTimes = useMemo(() => uniq(tx.frequency_time), [tx]); // optional, if you later want it

  const aimsOptions: Option[] = useMemo(() => aims.map((a) => ({ value: a, label: t(a) })), [aims, t]);

  // ✅ tags = all taxonomy buckets except aims
  const tagOptions: Option[] = useMemo(() => {
    const buckets = [
      ...(tx.topics || []),
      ...(tx.lc9 || []),
      ...(tx.cognitive_levels || []),
      ...(tx.physical_levels || []),
      ...(tx.timing || []),
      ...(tx.duration_buckets || []),
      ...(tx.sex_specific || []),
      ...(tx.where || []),
      ...(tx.setting || []),

      // optional extra metadata as tags if desired
      ...(tx.primary_diagnoses || []),
      ...(tx.input_from || []),
      ...(tx.original_languages || []),
    ];

    return uniq(buckets)
      .filter((x) => !aims.includes(x))
      .map((tag) => ({ value: tag, label: t(tag) }));
  }, [tx, aims, t]);

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
              {contentTypes.map((type: string) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </Col>

          {/* ✅ NEW: Aims */}
          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={aimsOptions}
              value={(aimsFilter || []).map((a) => ({ value: a, label: t(a) }))}
              onChange={(opts) => onAimsFilter((opts || []).map((opt) => (opt as any).value))}
              placeholder={t('Filter by Aims')}
            />
          </Col>

          {/* ✅ Tags */}
          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={tagOptions}
              value={(tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
              onChange={(opts) => onTagFilter((opts || []).map((opt) => (opt as any).value))}
              placeholder={t('Filter by Tags')}
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
