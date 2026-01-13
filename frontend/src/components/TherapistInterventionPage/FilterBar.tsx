import React from 'react';
import { Col, Form, Row, Card } from 'react-bootstrap';
import Select from 'react-select';

interface Props {
  searchTerm: string;
  setSearchTerm: (val: string) => void;

  patientTypeFilter: string;
  setPatientTypeFilter: (val: string) => void;

  diagnosisFilter: string[];
  setDiagnosisFilter: (val: string[]) => void;

  contentTypeFilter: string;
  setContentTypeFilter: (val: string) => void;

  tagFilter: string[];
  setTagFilter: (val: string[]) => void;

  benefitForFilter: string[];
  setBenefitForFilter: (val: string[]) => void;

  frequencyFilter: string;
  setFrequencyFilter: (val: string) => void;

  config: any;
  t: (key: string) => string;
}

const FilterBar: React.FC<Props> = ({
  searchTerm,
  setSearchTerm,

  patientTypeFilter,
  setPatientTypeFilter,

  diagnosisFilter,
  setDiagnosisFilter,

  contentTypeFilter,
  setContentTypeFilter,

  tagFilter,
  setTagFilter,

  benefitForFilter,
  setBenefitForFilter,

  frequencyFilter,
  setFrequencyFilter,

  config,
  t,
}) => {
  const patientTypes = Object.keys(config?.patientInfo?.function || []);

  const diagnosisOptions =
    patientTypeFilter &&
    config?.patientInfo?.function?.[patientTypeFilter]?.diagnosis
      ? config.patientInfo.function[patientTypeFilter].diagnosis
      : [];

  return (
    <Card className="p-3 shadow-sm w-100" aria-label={t('Filter Interventions')}>
      <Row className="g-3">
        {/* Search */}
        <Col xs={12}>
          <Form.Group controlId="searchInput">
            <Form.Label visuallyHidden>
              {t('Search Interventions')}
            </Form.Label>
            <Form.Control
              type="text"
              placeholder={t('Search Interventions')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Form.Group>
        </Col>

        {/* Patient Type (Speciality) */}
        <Col sm={6} md={4} lg={3}>
          <Form.Group controlId="filterPatientType">
            <Form.Label visuallyHidden>
              {t('Filter by Patient Type')}
            </Form.Label>
            <Form.Select
              value={patientTypeFilter}
              onChange={(e) => {
                setPatientTypeFilter(e.target.value);
                setDiagnosisFilter([]); // reset diagnosis on change
              }}
            >
              <option value="">{t('All Patient Types')}</option>
              {patientTypes.map((type) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        {/* Diagnosis (dependent) */}
        {patientTypeFilter && (
          <Col sm={6} md={4} lg={3}>
            <Form.Group controlId="filterDiagnosis">
              <Form.Label visuallyHidden>
                {t('Filter by Diagnosis')}
              </Form.Label>
              <Select
                isMulti
                placeholder={t('Filter by Diagnosis')}
                options={diagnosisOptions.map((d: string) => ({
                  value: d,
                  label: t(d),
                }))}
                value={diagnosisFilter.map((d) => ({
                  value: d,
                  label: t(d),
                }))}
                onChange={(opts) =>
                  setDiagnosisFilter(opts.map((o) => o.value))
                }
                aria-label={t('Filter by Diagnosis')}
              />
            </Form.Group>
          </Col>
        )}

        {/* Content Type */}
        <Col sm={6} md={4} lg={3}>
          <Form.Group controlId="filterContentType">
            <Form.Label visuallyHidden>
              {t('Filter by Content Type')}
            </Form.Label>
            <Form.Select
              value={contentTypeFilter}
              onChange={(e) => setContentTypeFilter(e.target.value)}
            >
              <option value="">{t('All Content Types')}</option>
              {config?.RecomendationInfo?.types?.map((type: string) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>

        {/* Tags */}
        <Col sm={6} md={4} lg={3}>
          <Form.Group controlId="filterTags">
            <Form.Label visuallyHidden>
              {t('Filter by Tags')}
            </Form.Label>
            <Select
              isMulti
              placeholder={t('Filter by Tags')}
              options={config?.RecomendationInfo?.tags?.map((tag: string) => ({
                value: tag,
                label: t(tag),
              }))}
              value={tagFilter.map((tag) => ({
                value: tag,
                label: t(tag),
              }))}
              onChange={(opts) => setTagFilter(opts.map((o) => o.value))}
              aria-label={t('Filter by Tags')}
            />
          </Form.Group>
        </Col>

        {/* Benefits */}
        <Col sm={6} md={4} lg={3}>
          <Form.Group controlId="filterBenefit">
            <Form.Label visuallyHidden>
              {t('Filter by Benefit')}
            </Form.Label>
            <Select
              isMulti
              placeholder={t('Filter by Benefit')}
              options={config?.RecomendationInfo?.benefits?.map((b: string) => ({
                value: b,
                label: t(b),
              }))}
              value={benefitForFilter.map((b) => ({
                value: b,
                label: t(b),
              }))}
              onChange={(opts) =>
                setBenefitForFilter(opts.map((o) => o.value))
              }
              aria-label={t('Filter by Benefit')}
            />
          </Form.Group>
        </Col>

        {/* Frequency */}
        <Col sm={6} md={4} lg={3}>
          <Form.Group controlId="filterFrequency">
            <Form.Label visuallyHidden>
              {t('Filter by Frequency')}
            </Form.Label>
            <Form.Select
              value={frequencyFilter}
              onChange={(e) => setFrequencyFilter(e.target.value)}
            >
              <option value="">{t('All Frequencies')}</option>
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
};

export default FilterBar;
