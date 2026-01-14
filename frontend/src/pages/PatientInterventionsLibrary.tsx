// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Nav,
  Badge,
  Button,
} from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import ErrorAlert from '../components/common/ErrorAlert';

import InterventionList from '../components/TherapistInterventionPage/InterventionList'; // reuse list UI
import PatientInterventionPopUp from '../components/PatientPage/PatientInterventionPopUp'; // ✅ patient popup

import apiClient from '../api/client';
import authStore from '../stores/authStore';
import config from '../config/config.json';
import { filterInterventions } from '../utils/filterUtils';
import { generateTagColors } from '../utils/interventions';
import { translateText } from '../utils/translate';
import type { InterventionTypeTh } from '../types';

type MainTab = 'library' | 'templates';

const PatientInterventionsLibrary: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // ─────────────────────────── data ───────────────────────────
  const [recommendations, setRecommendations] = useState<InterventionTypeTh[]>([]);
  const [filteredInterventions, setFilteredInterventions] = useState<InterventionTypeTh[]>([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  // ─────────────────────────── tabs ───────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('library');

  // ─────────────────────────── filters ───────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  // patient-side: patient types are based on Patient.function (stored as specialisation in WelcomeArea earlier),
  // BUT we still let them filter “All Patient Types” only if you want.
  // For patient simplicity, we hide that filter by default.
  const tagColors = useMemo(
    () => generateTagColors(config.RecomendationInfo.tags),
    []
  );

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

  // ─────────────────────────── auth gate ───────────────────────────
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

  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
      return;
    }

    fetchLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate]);

  const fetchLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      // ✅ Use the same endpoint you already have.
      // If you want to restrict to “public only” for patients,
      // do that on backend (recommended).
      const res = await apiClient.get<InterventionTypeTh[]>('interventions/all/');

      // Optional: filter out private interventions (safety)
      const visible = (res.data || []).filter((x) => !x.is_private);

      setRecommendations(visible);
      setFilteredInterventions(visible);
    } catch (e) {
      console.error('Error fetching interventions:', e);
      setError(t('Error fetching recommendations. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  // translate titles
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!recommendations.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      const pairs = await Promise.all(
        recommendations.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(
              rec.title,
              (i18n.language || 'en').slice(0, 2)
            );
            return [rec._id, { title: translatedText || rec.title, lang: detectedSourceLanguage || null }] as const;
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
  }, [recommendations, i18n.language]);

  // apply filters
  useEffect(() => {
    const filtered = filterInterventions(recommendations, {
      patientTypeFilter: '', // ✅ no patient type filter in patient page
      contentTypeFilter,
      tagFilter,
      benefitForFilter,
      searchTerm,
    });
    setFilteredInterventions(filtered);
  }, [recommendations, contentTypeFilter, tagFilter, benefitForFilter, searchTerm]);

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
    media_url: it.media_file, // some older code expects media_url
    link: it.link,
    tags: it.tags || [],
    benefitFor: it.benefitFor || [],
    preview_img: it.preview_img,
    // notes intentionally NOT shown from this page unless you pass it explicitly
    // (notes are typically plan-assignment specific)
  });

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />
      <Container className="main-content mt-4">

        <Row>
          <Col>
            {error && <ErrorAlert message={error} onClose={() => setError('')} />}
          </Col>
        </Row>

        {/* Tabs: Patient sees only Library by default, but you asked for “patient version”
            of this page. If you want NO templates tab, remove Nav entirely. */}
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
              {/* Templates tab intentionally hidden for patient */}
              {/* <Nav.Item><Nav.Link eventKey="templates">{t('Templates')}</Nav.Link></Nav.Item> */}
            </Nav>
          </Col>
        </Row>

        {/* Library only */}
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

                <Row className="mb-3">
                  <Col>
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
                  <Col>
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
                      {loading
                        ? t('Loading') + '...'
                        : `${filteredInterventions.length} ${t('items')}`}
                    </span>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row>
          <Col xs={12}>
            {/* ✅ Patient page: list only, no plus/minus/edit actions */}
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

      {/* ✅ IMPORTANT: use patient popup, not ProductPopup */}
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
