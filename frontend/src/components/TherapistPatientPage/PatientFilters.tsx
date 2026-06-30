// src/components/TherapistPatientPage/PatientFilters.tsx
import React from 'react';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';

import { TherapistPatientsStore, SortKey } from '@/stores/therapistPatientsStore';

type Props = {
  store: TherapistPatientsStore;
  sexOptions: string[];
  durationOptions: string[];
};

const PatientFilters: React.FC<Props> = observer(({ store, sexOptions, durationOptions }) => {
  const { t } = useTranslation();

  return (
    <Card className="mb-3">
      <Card.Body>
        <Row className="g-3">
          <Col xs={12} md={3}>
            <Form.Control
              type="text"
              placeholder={String(t('Search by name, ID or username'))}
              value={store.searchTerm}
              onChange={(e) => store.setSearchTerm(e.target.value)}
            />
          </Col>

          <Col xs={12} md={3}>
            <Form.Control
              type="date"
              value={store.birthdateFilter}
              onChange={(e) => store.setBirthdateFilter(e.target.value)}
              aria-label={String(t('Filter by Birth Date'))}
            />
          </Col>

          <Col xs={12} md={3}>
            <Form.Select
              value={store.sexFilter}
              onChange={(e) => store.setSexFilter(e.target.value)}
            >
              <option value="">{String(t('Filter by Sex'))}</option>
              {sexOptions.map((sex) => (
                <option key={sex} value={sex}>
                  {String(t(sex))}
                </option>
              ))}
            </Form.Select>
          </Col>

          <Col xs={12} md={3}>
            <Form.Select
              value={store.durationFilter}
              onChange={(e) => store.setDurationFilter(e.target.value)}
            >
              <option value="">{String(t('Filter by Duration'))}</option>
              {durationOptions.map((duration) => (
                <option key={duration} value={duration}>
                  {String(t(duration))}
                </option>
              ))}
            </Form.Select>
          </Col>
        </Row>

        <Row className="mt-3 align-items-center">
          <Col xs={12} md={3}>
            <Form.Select
              value={store.diseaseFilter}
              onChange={(e) => store.setDiseaseFilter(e.target.value)}
            >
              <option value="">{String(t('Filter by Disease'))}</option>
              {store.diseaseOptions.map((d) => (
                <option key={d} value={d}>
                  {String(t(d))}
                </option>
              ))}
            </Form.Select>
          </Col>

          <Col xs={12} md={6}>
            <Form.Label className="me-2">{String(t('Sort by'))}</Form.Label>
            <Form.Select
              aria-label="Sort by"
              value={store.sortBy}
              onChange={(e) => store.setSortBy(e.target.value as SortKey)}
              style={{ maxWidth: 320, display: 'inline-block' }}
            >
              <option value="ampel">{String(t('Performance'))}</option>
              <option value="created">{String(t('Newest created'))}</option>
            </Form.Select>
          </Col>

          <Col className="d-flex flex-wrap gap-3 justify-content-end">
            <Button variant="outline-secondary" onClick={store.resetFilters}>
              {String(t('Reset filters'))}
            </Button>
          </Col>

          <Col className="d-flex flex-wrap gap-3 justify-content-end">
            <Form.Check
              type="switch"
              id="toggle-completed"
              label={String(t('Show completed'))}
              checked={store.showCompleted}
              onChange={(e) => store.setShowCompleted(e.currentTarget.checked)}
            />
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
});

export default PatientFilters;
