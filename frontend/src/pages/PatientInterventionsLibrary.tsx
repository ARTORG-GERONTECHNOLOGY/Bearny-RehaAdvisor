// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Container, Row, Col, Card, Form, Nav, Button } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import ErrorAlert from '../components/common/ErrorAlert';

import InterventionList from '../components/TherapistInterventionPage/InterventionList'; // reuse list UI
import PatientInterventionPopUp from '../components/PatientPage/PatientInterventionPopUp';

import authStore from '../stores/authStore';
import { patientInterventionsLibraryStore } from '../stores/interventionsLibraryStore';

import config from '../config/config.json';
import { filterInterventions } from '../utils/filterUtils';
import { generateTagColors } from '../utils/interventions';
import { translateText } from '../utils/translate';
import type { InterventionTypeTh } from '../types';

type MainTab = 'library';

const PatientInterventionsLibrary: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // ─────────────────────────── auth gate ───────────────────────────
  const [authChecked, setAuthChecked] = useState(false);

  // ─────────────────────────── tabs ───────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('library');

  // ─────────────────────────── filters ───────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  const tagColors = useMemo(() => generateTagColors(config.RecomendationInfo.tags), []);

  type TitleMap = Record<string, { title: string; lang: string | null }>;
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  // ─────────────────────────── popup ───────────────────────────
  const [selectedItem, setSelectedItem] = useState<InterventionTypeTh | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const handleItemClick = (item: InterventionTypeTh) => {
    setSelectedItem(item);
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setSelectedItem(null);
    setShowPopup(false);
  };

  // ─────────────────────────── auth check ───────────────────────────
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await authStore.checkAuthentication();
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ─────────────────────────── load data via MobX store ───────────────────────────
  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
      return;
    }

    patientInterventionsLibraryStore.fetchAll({ mode: 'patient' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate]);

  // store-driven source list (patient hides private)
  const sourceItems = patientInterventionsLibraryStore.visibleItemsForPatient;

  // translate titles (still fine to keep as page-local cache)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sourceItems.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      const lang = (i18n.language || 'en').slice(0, 2);

      const pairs = await Promise.all(
        sourceItems.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title, lang);
            return [
              rec._id,
              {
                title: translatedText || rec.title,
                lang: detectedSourceLanguage || null,
              },
            ] as const;
          } catch {
            return [rec._id, { title: rec.title, lang: null }] as const;
          }
        })
      );

      if (!cancelled) setTranslatedTitles(Object.fromEntries(pairs));
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceItems, i18n.language]);

  // apply filters (kept local)
  const filteredInterventions = useMemo(() => {
    return filterInterventions(sourceItems, {
      patientTypeFilter: '', // ✅ no patient type filter on patient library
      contentTypeFilter,
      tagFilter,
      benefitForFilter,
      searchTerm,
    });
  }, [sourceItems, contentTypeFilter, tagFilter, benefitForFilter, searchTerm]);

  const resetAllFilters = () => {
    setSearchTerm('');
    setContentTypeFilter('');
    setTagFilter([]);
    setBenefitForFilter([]);
  };

  // Convert InterventionTypeTh to Patient popup MediaItem shape
  const toPatientPopupItem = (it: InterventionTypeTh) => ({
    title: it.title,
    intervention_title: it.title,
    content_type: it.content_type,
    description: it.description,
    media_file: it.media_file,
    media_url: it.media_file,
    link: it.link,
    tags: it.tags || [],
    benefitFor: it.benefitFor || [],
    preview_img: it.preview_img,
  });

  const storeError = patientInterventionsLibraryStore.error;
  const storeLoading = patientInterventionsLibraryStore.loading;

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />

      <Container className="main-content mt-4">
        <Row>
          <Col>
            {storeError && (
              <ErrorAlert
                message={storeError}
                onClose={() => patientInterventionsLibraryStore.clearError()}
              />
            )}
          </Col>
        </Row>

        {/* Tabs (patient only shows Library) */}
        <Row className="mb-3">
          <Col>
            <Nav
              variant="tabs"
              activeKey={mainTab}
              onSelect={(k) => setMainTab((k as MainTab) || 'library')}
            >
              <Nav.Item>
                <Nav.Link eventKey="library">{t('Interventions')}</Nav.Link>
              </Nav.Item>
            </Nav>
          </Col>
        </Row>

        {/* Filters */}
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
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row className="mb-3">
                  <Col>
                    <Form.Select
                      value={contentTypeFilter}
                      onChange={(e) => setContentTypeFilter(e.target.value)}
                    >
                      <option value="">{t('Filter by Content Type')}</option>
                      {config.RecomendationInfo.types.map((type: string) => (
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
                      options={config.RecomendationInfo.tags.map((tag: string) => ({
                        value: tag,
                        label: t(tag),
                      }))}
                      value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
                      onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
                      placeholder={t('Filter by Tags')}
                    />
                  </Col>

                  <Col xs={12} md={6}>
                    <Select
                      isMulti
                      options={config.RecomendationInfo.benefits.map((b: string) => ({
                        value: b,
                        label: t(b),
                      }))}
                      value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
                      onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
                      placeholder={t('Filter by Benefit')}
                    />
                  </Col>
                </Row>

                <Row className="align-items-center">
                  <Col>
                    <Button variant="outline-secondary" size="sm" onClick={resetAllFilters}>
                      {t('Reset filters')}
                    </Button>
                  </Col>

                  <Col className="text-end">
                    <span className="text-muted small">
                      {storeLoading
                        ? `${t('Loading')}...`
                        : `${filteredInterventions.length} ${t('items')}`}
                    </span>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* List */}
        <Row>
          <Col xs={12}>
            <InterventionList
              items={filteredInterventions}
              onClick={handleItemClick}
              t={t}
              tagColors={tagColors}
              translatedTitles={translatedTitles}
            />
          </Col>
        </Row>
      </Container>

      {/* Popup */}
      {selectedItem && (
        <PatientInterventionPopUp
          show={showPopup}
          handleClose={handleClosePopup}
          item={toPatientPopupItem(selectedItem)}
        />
      )}

      <Footer />
    </div>
  );
});

export default PatientInterventionsLibrary;
