import React, { useMemo } from 'react';
import { Card, Row, Col, Form, Button } from 'react-bootstrap';
import Select from 'react-select';
import { FaUndo } from 'react-icons/fa';

// ✅ NEW taxonomy config
import interventionsConfig from '../../config/interventions.json';

export type LibraryFiltersState = {
  searchTerm: string;
  patientTypeFilter: string;
  contentTypeFilter: string;

  // ✅ aims is its own field (not part of tags)
  aimsFilter: string[];

  // ✅ tags = everything except aims
  tagFilter: string[];

  frequencyFilter: string; // kept for compatibility
};

type Props = {
  t: any;
  patientTypes: string[];
  filters: LibraryFiltersState;
  onChange: (next: LibraryFiltersState) => void;
  onReset: () => void;
};

const uniq = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));

const LibraryFiltersCard: React.FC<Props> = ({ t, patientTypes, filters, onChange, onReset }) => {
  const tx = (interventionsConfig as any)?.interventionsTaxonomy || {};

  const aims = useMemo(() => uniq(tx.aims), [tx]);
  const contentTypes = useMemo(() => uniq(tx.content_types), [tx]);
  const frequencyTimes = useMemo(() => uniq(tx.frequency_time), [tx]);

  // ✅ Build tag options from taxonomy EXCLUDING aims
  const tagOptions = useMemo(() => {
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

      // optional useful metadata also as tags if you want
      ...(tx.primary_diagnoses || []),
      ...(tx.input_from || []),
      ...(tx.original_languages || []),
    ];

    return uniq(buckets)
      .filter((x) => !aims.includes(x))
      .map((tag) => ({ value: tag, label: t(tag) }));
  }, [tx, aims, t]);

  const aimsOptions = useMemo(() => aims.map((a) => ({ value: a, label: t(a) })), [aims, t]);

  return (
    <Row className="mb-4">
      <Col xs={12}>
        <Card className="mb-3">
          <Card.Body>
            <Row className="mb-3">
              <Col>
                <Form.Group controlId="searchInput">
                  <Form.Control
                    type="text"
                    placeholder={t('Search Interventions')}
                    value={filters.searchTerm}
                    onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3 g-3">
              <Col xs={12} md={6}>
                <Form.Select
                  value={filters.patientTypeFilter}
                  onChange={(e) => onChange({ ...filters, patientTypeFilter: e.target.value })}
                >
                  <option value="">{t('All Patient Types')}</option>
                  {patientTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(type)}
                    </option>
                  ))}
                </Form.Select>
              </Col>

              <Col xs={12} md={6}>
                <Form.Select
                  value={filters.contentTypeFilter}
                  onChange={(e) => onChange({ ...filters, contentTypeFilter: e.target.value })}
                >
                  <option value="">{t('Filter by Content Type')}</option>
                  {contentTypes.map((type: string) => (
                    <option key={type} value={type}>
                      {t(type)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row className="mb-3 g-3">
              {/* ✅ Aims */}
              <Col xs={12} md={6}>
                <Select
                  isMulti
                  options={aimsOptions}
                  value={(filters.aimsFilter || []).map((a) => ({ value: a, label: t(a) }))}
                  onChange={(opts) => onChange({ ...filters, aimsFilter: (opts || []).map((o: any) => o.value) })}
                  placeholder={t('Filter by Aims')}
                />
              </Col>

              {/* ✅ Tags (everything except aims) */}
              <Col xs={12} md={6}>
                <Select
                  isMulti
                  options={tagOptions}
                  value={(filters.tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
                  onChange={(opts) => onChange({ ...filters, tagFilter: (opts || []).map((o: any) => o.value) })}
                  placeholder={t('Filter by Tags')}
                />
              </Col>
            </Row>

            <Row className="mb-3 g-3">
              <Col xs={12} md={6}>
                <Form.Select
                  value={filters.frequencyFilter}
                  onChange={(e) => onChange({ ...filters, frequencyFilter: e.target.value })}
                >
                  <option value="">{t('All Frequencies')}</option>
                  {frequencyTimes.map((f: string) => (
                    <option key={f} value={f}>
                      {t(f)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row>
              <Col>
                <Button variant="outline-secondary" size="sm" onClick={onReset}>
                  <FaUndo className="me-2" /> {t('Reset filters')}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
};

export default LibraryFiltersCard;
