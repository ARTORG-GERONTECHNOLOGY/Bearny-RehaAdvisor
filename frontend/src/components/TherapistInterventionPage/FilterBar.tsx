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
  <Card className="p-3 shadow-sm w-100">
    <Row className="g-3">
      <Col xs={12}>
        <Form.Control
          type="text"
          placeholder={t('Search Interventions')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Col>

      <Col sm={6} md={4} lg={3}>
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
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Select
          value={coreSupportFilter}
          onChange={(e) => setCoreSupportFilter(e.target.value)}
        >
          <option value="">{t('Filter by Core/Supportive')}</option>
          {(config.RecomendationInfo.intensity as string[]).map((opt) => (
            <option key={opt} value={opt}>
              {t(opt)}
            </option>
          ))}
        </Form.Select>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Select
          value={contentTypeFilter}
          onChange={(e) => setContentTypeFilter(e.target.value)}
        >
          <option value="">{t('Filter by Content Type')}</option>
          {(config.RecomendationInfo.types as string[]).map((type) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </Form.Select>
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Select
          isMulti
          placeholder={t('Filter by Tags')}
          options={(config.RecomendationInfo.tags as string[]).map((tag) => ({
            value: tag,
            label: t(tag),
          }))}
          value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
          onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
        />
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Select
          isMulti
          placeholder={t('Filter by Benefit')}
          options={(config.RecomendationInfo.benefits as string[]).map((b) => ({
            value: b,
            label: t(b),
          }))}
          value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
          onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
        />
      </Col>

      <Col sm={6} md={4} lg={3}>
        <Form.Select value={frequencyFilter} onChange={(e) => setFrequencyFilter(e.target.value)}>
          <option value="">{t('Filter by Frequency')}</option>
          {(config.RecomendationInfo.frequency as string[]).map((freq) => (
            <option key={freq} value={freq}>
              {t(freq)}
            </option>
          ))}
        </Form.Select>
      </Col>
    </Row>
  </Card>
);

export default FilterBar;
