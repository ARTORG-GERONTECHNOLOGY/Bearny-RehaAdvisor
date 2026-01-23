import React from 'react';
import { Card, Row, Col, Form, Button } from 'react-bootstrap';
import Select from 'react-select';
import { FaUndo } from 'react-icons/fa';
import config from '../../config/config.json';

export type LibraryFiltersState = {
  searchTerm: string;
  patientTypeFilter: string;
  contentTypeFilter: string;
  tagFilter: string[];
  benefitForFilter: string[];
  frequencyFilter: string; // kept for compatibility even if not used in filterInterventions
};

type Props = {
  t: any;
  patientTypes: string[];
  filters: LibraryFiltersState;
  onChange: (next: LibraryFiltersState) => void;
  onReset: () => void;
};

const LibraryFiltersCard: React.FC<Props> = ({ t, patientTypes, filters, onChange, onReset }) => {
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
                  {(config as any).RecomendationInfo.types.map((type: string) => (
                    <option key={type} value={type}>
                      {t(type)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>

            <Row className="mb-3 g-3">
              <Col xs={12} md={6}>
                <Select
                  isMulti
                  options={(config as any).RecomendationInfo.tags.map((tag: string) => ({
                    value: tag,
                    label: t(tag),
                  }))}
                  value={filters.tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
                  onChange={(opts) => onChange({ ...filters, tagFilter: (opts || []).map((o: any) => o.value) })}
                  placeholder={t('Filter by Tags')}
                />
              </Col>

              <Col xs={12} md={6}>
                <Select
                  isMulti
                  options={(config as any).RecomendationInfo.benefits.map((b: string) => ({
                    value: b,
                    label: t(b),
                  }))}
                  value={filters.benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
                  onChange={(opts) =>
                    onChange({ ...filters, benefitForFilter: (opts || []).map((o: any) => o.value) })
                  }
                  placeholder={t('Filter by Benefit')}
                />
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
