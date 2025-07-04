import React from 'react';
import { Col, Form, Row, Card } from 'react-bootstrap';
import Select from 'react-select';

interface Props {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  patientTypeFilter: string;
  setPatientTypeFilter: (val: string) => void;
  coreSupportFilter: string;
  setCoreSupportFilter: (val: string) => void;
  contentTypeFilter: string;
  setContentTypeFilter: (val: string) => void;
  tagFilter: string[];
  setTagFilter: (val: string[]) => void;
  benefitForFilter: string[];
  setBenefitForFilter: (val: string[]) => void;
  frequencyFilter: string;
  setFrequencyFilter: (val: string) => void;
  diagnoses: string[];
  config: any;
  t: (key: string) => string;
}

const FilterBar: React.FC<Props> = ({
  searchTerm,
  setSearchTerm,
  patientTypeFilter,
  setPatientTypeFilter,
  coreSupportFilter,
  setCoreSupportFilter,
  contentTypeFilter,
  setContentTypeFilter,
  tagFilter,
  setTagFilter,
  benefitForFilter,
  setBenefitForFilter,
  frequencyFilter,
  setFrequencyFilter,
  diagnoses,
  config,
  t,
}) => (
  <Card className="p-3 shadow-sm w-100" aria-label={t('Filter Interventions')}>
    <Row className="g-3">
      <Col xs={12}>
        <Form.Group controlId="searchInput">
          <Form.Label visuallyHidden>{t('Search Interventions')}</Form.Label>
          <Form.Control
            type="text"
            placeholder={t('Search Interventions')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterPatientType">
          <Form.Label visuallyHidden>{t('Filter by Patient Type')}</Form.Label>
          <Form.Select
            value={patientTypeFilter}
            onChange={(e) => setPatientTypeFilter(e.target.value)}
          >
            <option value="">{t('Filter by Patient Type')}</option>
            {diagnoses.map((type) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterCoreSupport">
          <Form.Label visuallyHidden>{t('Filter by Core/Supportive')}</Form.Label>
          <Form.Select
            value={coreSupportFilter}
            onChange={(e) => setCoreSupportFilter(e.target.value)}
          >
            <option value="">{t('Filter by Core/Supportive')}</option>
            {config?.RecomendationInfo?.intensity?.map((opt: string) => (
              <option key={opt} value={opt}>
                {t(opt)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterContentType">
          <Form.Label visuallyHidden>{t('Filter by Content Type')}</Form.Label>
          <Form.Select
            value={contentTypeFilter}
            onChange={(e) => setContentTypeFilter(e.target.value)}
          >
            <option value="">{t('Filter by Content Type')}</option>
            {config?.RecomendationInfo?.types?.map((type: string) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterTags">
          <Form.Label visuallyHidden>{t('Filter by Tags')}</Form.Label>
          <Select
            isMulti
            placeholder={t('Filter by Tags')}
            options={config?.RecomendationInfo?.tags?.map((tag: string) => ({
              value: tag,
              label: t(tag),
            }))}
            value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
            onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
            aria-label={t('Filter by Tags')}
          />
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterBenefit">
          <Form.Label visuallyHidden>{t('Filter by Benefit')}</Form.Label>
          <Select
            isMulti
            placeholder={t('Filter by Benefit')}
            options={config?.RecomendationInfo?.benefits?.map((b: string) => ({
              value: b,
              label: t(b),
            }))}
            value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
            onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
            aria-label={t('Filter by Benefit')}
          />
        </Form.Group>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Group controlId="filterFrequency">
          <Form.Label visuallyHidden>{t('Filter by Frequency')}</Form.Label>
          <Form.Select
            value={frequencyFilter}
            onChange={(e) => setFrequencyFilter(e.target.value)}
          >
            <option value="">{t('Filter by Frequency')}</option>
            {config?.RecomendationInfo?.frequency?.map((freq: string) => (
              <option key={freq} value={freq}>
                {t(freq)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </Col>
    </Row>
  </Card>
);

export default FilterBar;
