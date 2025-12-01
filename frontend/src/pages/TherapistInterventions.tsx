import React, { useEffect, useMemo, useState } from 'react';
import {
  Container, Row, Col, Card, Button, ButtonGroup, Form, Nav,
  Badge, OverlayTrigger, Tooltip
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { FaPlus, FaMinus, FaEdit, FaUndo } from 'react-icons/fa';
import Select from 'react-select';

import { filterInterventions } from '../utils/filterUtils';
import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import ProductPopup from '../components/TherapistInterventionPage/ProductPopup';
import InterventionList from '../components/TherapistInterventionPage/InterventionList';
import AddInterventionPopup from '../components/AddIntervention/AddRecomendationPopUp';
import ErrorAlert from '../components/common/ErrorAlert';

import config from '../config/config.json';
import apiClient from '../api/client';
import authStore from '../stores/authStore';
import { generateTagColors } from '../utils/interventions';
import { translateText } from '../utils/translate';

import TemplateAssignModal from '../components/TherapistInterventionPage/TemplateAssignModal';
import TemplateTimeline from '../components/TherapistInterventionPage/TemplateTimeline';
import { TemplateItem, TemplatePayload } from '../types/templates';
import { InterventionTypeTh } from '../types';

const TherapistRecomendations: React.FC = () => {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  // ─────────────────────────── Library (catalog) ───────────────────────────
  const [recommendations, setRecommendations] = useState<InterventionTypeTh[]>([]);
  const [filteredInterventions, setFilteredInterventions] = useState<InterventionTypeTh[]>([]);
  const [loading, setLoading] = useState(true);

  // ─────────────────────────── Templates (defaults) ───────────────────────────
  type MainTab = 'library' | 'templates';
  const [mainTab, setMainTab] = useState<MainTab>('library');

  // sub-tab inside Templates view
  type TemplateLeftTab = 'my' | 'all';
  const [templateLeftTab, setTemplateLeftTab] = useState<TemplateLeftTab>('my');

  const [templateDiag, setTemplateDiag] = useState<string>('');
  const [templateHorizon, setTemplateHorizon] = useState<number>(84);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [tLoading, setTLoading] = useState<boolean>(false);

  // Template assign modal (create/modify)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignInterventionId, setAssignInterventionId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<'create' | 'modify'>('create');
// Normalize "segment" whether it's an object from `segments` or a single `schedule`
const normalizeSegment = (segOrSchedule: any, item?: TemplateItem) => {
  const raw = segOrSchedule?.schedule ? segOrSchedule.schedule : segOrSchedule || {};
  const start_day = segOrSchedule?.from_day ?? raw.start_day ?? 1;
  const end_day   = raw.end_day ?? segOrSchedule?.end_day;
  const selectedDays = raw.selectedDays || raw.selected_days || [];
  return {
    unit: raw.unit || 'day',
    interval: raw.interval ?? 1,
    selectedDays,
    start_day,
    end_day,
    start_time: raw.start_time || raw.startTime || '08:00',
  };
};

const getSegments = (it: TemplateItem) => {
  const segs = (it as any).segments;
  if (Array.isArray(segs) && segs.length) return segs.map((s: any) => normalizeSegment(s));
  // Fallback to single schedule + range
  const s = normalizeSegment(it.schedule, it);
  return [s];
};

// Count occurrences in a segment’s day window
const countOccurrencesInRange = (it: TemplateItem, fromDay: number, toDay?: number) => {
  const occ = it.occurrences || [];
  return occ.filter(o => o.day >= fromDay && (toDay ? o.day <= toDay : true)).length;
};

// Human summary for a segment (used in My Template list and day modal)
const segmentSummary = (seg: any, it: TemplateItem, t: any) => {
  const daysStr =
    Array.isArray(seg.selectedDays) && seg.selectedDays.length
      ? ` • ${seg.selectedDays.join(', ')}`
      : '';
  const rangeStr = ` ${t("from day")} ${seg.start_day}${seg.end_day ? ` → ${t("day")} ${seg.end_day}` : ''}`;
  const occCount = countOccurrencesInRange(it, seg.start_day, seg.end_day);
  return `• ${t(seg.unit)}/${seg.interval}${daysStr}${rangeStr} • ${t("Occurrences")} ${occCount}`;
};

  const openAssignToTemplate = (id: string, mode: 'create' | 'modify' = 'create') => {
    setAssignMode(mode);
    setAssignInterventionId(id);
    setAssignOpen(true);
  };

  // Delete from template (fixed endpoint string)
// Delete from template (corrected to match backend)
const removeTemplateItem = async (
  diagnosis: string,
  interventionId: string,
  startDay?: number
) => {
  try {
    const payload: any = {
      intervention_id: interventionId,
      diagnosis,
    };

    // optional block-level removal
    if (typeof startDay === "number") {
      payload.start_day = startDay;
    }

    const res = await apiClient.post(
      `therapists/${authStore.id}/interventions/remove-from-patient-types/`,
      payload
    );

    // refresh UI
    fetchTemplates(templateDiag, templateHorizon);
  } catch (e: any) {
    const data = e?.response?.data || {};
    const base =
      (Array.isArray(data.non_field_errors) &&
        data.non_field_errors.join(" ")) ||
      data.message ||
      data.error ||
      t("Failed to delete from template.");

    if (data.field_errors) {
      const extra = Object.entries(data.field_errors)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" ") : v}`)
        .join("\n");
      setError(`${base}\n${extra}`);
    } else {
      setError(base);
    }
  }
};


  // ─────────────────────────── Filters (library tab) ───────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [patientTypeFilter, setPatientTypeFilter] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [benefitForFilter, setBenefitForFilter] = useState<string[]>([]);

  // ─────────────────────────── Filters (templates → Browse All) ───────────────────────────
  const [tSearchTerm, setTSearchTerm] = useState('');
  const [tPatientTypeFilter, setTPatientTypeFilter] = useState('');
  const [tContentTypeFilter, setTContentTypeFilter] = useState('');
  const [tTagFilter, setTTagFilter] = useState<string[]>([]);
  const [tFrequencyFilter, setTFrequencyFilter] = useState('');
  const [tBenefitForFilter, setTBenefitForFilter] = useState<string[]>([]);
  const [templateFilteredAll, setTemplateFilteredAll] = useState<InterventionTypeTh[]>([]);

  const resetTemplateFilters = () => {
    setTSearchTerm('');
    setTPatientTypeFilter('');
    setTContentTypeFilter('');
    setTTagFilter([]);
    setTBenefitForFilter([]);
    setTFrequencyFilter('');
  };

  const [error, setError] = useState('');

  type TitleMap = Record<string, { title: string; lang: string | null }>;
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  

  const tagColors = generateTagColors(config.RecomendationInfo.tags);

  // Therapist specialisations → diagnoses
  const specialisations = authStore.specialisation?.split(',').map((s) => s.trim()) || [];
  const diagnoses = Array.isArray(specialisations)
    ? specialisations.flatMap((spec) => config?.patientInfo?.function?.[spec]?.diagnosis || [])
    : config?.patientInfo?.function?.[specialisations as string]?.diagnosis || [];

  // Auth gate
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await authStore.checkAuthentication();
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }
    fetchLibrary();
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate]);

  // Fetch all interventions (library)
  const fetchLibrary = async () => {
    try {
      const res = await apiClient.get<InterventionTypeTh[]>('interventions/all/');
      setRecommendations(res.data);
      setFilteredInterventions(res.data);
      setTemplateFilteredAll(res.data);
    } catch (e) {
      console.error('Error fetching recommendations:', e);
      setError(t('Error fetching recommendations. Please try again later.'));
    } finally {
      setLoading(false);
    }
  };

  // Translate titles (for search/display)
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
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title);
            return [rec._id, { title: translatedText, lang: detectedSourceLanguage }] as const;
          } catch {
            return [rec._id, { title: rec.title, lang: null }] as const;
          }
        })
      );
      if (!cancelled) setTranslatedTitles(Object.fromEntries(pairs));
    })();
    return () => { cancelled = true; };
  }, [recommendations, i18n.language]);

  // Library filtering (using helper)
  useEffect(() => {
    const filtered = filterInterventions(recommendations, {
      patientTypeFilter,
      contentTypeFilter,
      tagFilter,
      benefitForFilter,
      searchTerm,
    });
    setFilteredInterventions(filtered);
  }, [recommendations, patientTypeFilter, contentTypeFilter, tagFilter, benefitForFilter, searchTerm]);

  // Templates: “Browse All” filtering (using the same helper)
  useEffect(() => {
    const filtered = filterInterventions(recommendations, {
      patientTypeFilter: tPatientTypeFilter,
      contentTypeFilter: tContentTypeFilter,
      tagFilter: tTagFilter,
      benefitForFilter: tBenefitForFilter,
      searchTerm: tSearchTerm,
    });
    setTemplateFilteredAll(filtered);
  }, [recommendations, tPatientTypeFilter, tContentTypeFilter, tTagFilter, tBenefitForFilter, tSearchTerm]);

  // Fetch template plan (by diagnosis & horizon)
  const fetchTemplates = async (diag?: string, horizon?: number) => {
    try {
      setTLoading(true);
      const q = new URLSearchParams();
      if (diag) q.set('diagnosis', diag);
      if (horizon) q.set('horizon', String(horizon));
      const res = await apiClient.get<TemplatePayload>(
        `therapists/${authStore.id}/template-plan?${q.toString()}`
      );
      setTemplateItems(res.data.items || []);
    } catch {
      setTemplateItems([]);
    } finally {
      setTLoading(false);
    }
  };

  useEffect(() => {
    if (mainTab === 'templates') fetchTemplates(templateDiag, templateHorizon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainTab, templateDiag, templateHorizon]);

  // Open modify modal prefilled for a template item
  const openModifyTemplate = (it: TemplateItem) => {
    setAssignMode('modify');
    setAssignInterventionId(it.intervention._id);
    setTemplateDiag(it.diagnosis); // preselect diagnosis
    setAssignOpen(true);
  };

  // Product popup state
  const [selectedItem, setSelectedItem] = useState<InterventionTypeTh | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const handleItemClick = (item: InterventionTypeTh) => { setSelectedItem(item); setShowPopup(true); };
  const handleClosePopup = () => { setSelectedItem(null); setShowPopup(false); };

  // Add new intervention (catalog manage)
  const [showPopupAdd, setShowPopupAdd] = useState(false);
  const handleOpenAdd = () => setShowPopupAdd(true);
  const handleCloseAdd = () => setShowPopupAdd(false);

  const resetAllFilters = () => {
    setSearchTerm('');
    setPatientTypeFilter('');
    setContentTypeFilter('');
    setTagFilter([]);
    setBenefitForFilter([]);
  };

  const fmtDays = (arr?: string[]) => (arr && arr.length ? arr.join(', ') : '');

  // Find if an intervention is already in template (respect selected diagnosis if set)
  const findTemplateFor = (intId: string): TemplateItem | undefined => {
    if (templateDiag) {
      return templateItems.find(
        (it) => it.diagnosis === templateDiag && it.intervention._id === intId
      );
    }
    return templateItems.find((it) => it.intervention._id === intId);
  };
  // TherapistRecomendations.tsx (add below the existing “Translate titles (for search/display)” effect)

useEffect(() => {
  // collect template intervention IDs that aren't translated yet
  const missing = (templateItems || [])
    .map(it => it?.intervention?._id)
    .filter(Boolean)
    .filter(id => !translatedTitles[id as string]) as string[];

  if (!missing.length) return;

  let cancelled = false;
  (async () => {
    const pairs = await Promise.all(
      missing.map(async (id) => {
        const it = templateItems.find(x => x.intervention._id === id)!;
        try {
          const { translatedText, detectedSourceLanguage } =
            await translateText(it.intervention.title, (i18n.language || 'en').slice(0,2));
          return [id, { title: translatedText, lang: detectedSourceLanguage }] as const;
        } catch {
          return [id, { title: it.intervention.title, lang: null }] as const;
        }
      })
    );
    if (!cancelled) {
      setTranslatedTitles(prev => ({ ...prev, ...Object.fromEntries(pairs) }));
    }
  })();
  return () => { cancelled = true; };
}, [templateItems, i18n.language, translatedTitles]);


  // 🔧 NEW: open template item using the full catalog record
  const handleTemplateItemClick = (it: TemplateItem) => {
    const full = recommendations.find(r => r._id === it.intervention._id);
    if (full) {
      handleItemClick(full);
    } else {
      // Fallback: show a gentle error instead of crashing ProductPopup
      setError(t('Full details for this intervention are not loaded yet. Please refresh the page.'));
    }
  };

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />
      <Container className="main-content mt-4">
        <WelcomeArea user="TherapistPatients" />

        <Row>
          <Col>
            {error && <ErrorAlert message={error} onClose={() => setError('')} />}
          </Col>
        </Row>

        <Row className="mb-3">
          <Col xs={12} md="auto">
            <Button onClick={handleOpenAdd} className="btn-primary">
              {t('Add Intervention')}
            </Button>
          </Col>
        </Row>

        {/* Top-level tabs */}
        <Row className="mb-3">
          <Col>
            <Nav
              variant="tabs"
              activeKey={mainTab}
              onSelect={(k) => setMainTab((k as MainTab) || 'library')}
            >
              <Nav.Item><Nav.Link eventKey="library">{t('Interventions')}</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="templates">{t('Your Templates')}</Nav.Link></Nav.Item>
            </Nav>
          </Col>
        </Row>

        {mainTab === 'library' ? (
          <>
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
                          value={patientTypeFilter}
                          onChange={(e) => setPatientTypeFilter(e.target.value)}
                        >
                          <option value="">{t('Filter by Patient Type')}</option>
                          {diagnoses.map((type: string) => (
                            <option key={type} value={type}>{t(type)}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col>
                        <Form.Select
                          value={contentTypeFilter}
                          onChange={(e) => setContentTypeFilter(e.target.value)}
                        >
                          <option value="">{t('Filter by Content Type')}</option>
                          {config.RecomendationInfo.types.map((type) => (
                            <option key={type} value={type}>{t(type)}</option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>
                    <Row className="mb-3">
                      <Col>
                        <Select
                          isMulti
                          options={config.RecomendationInfo.tags.map((tag) => ({ value: tag, label: t(tag) }))}
                          value={tagFilter.map((tag) => ({ value: tag, label: tag }))}
                          onChange={(opts) => setTagFilter(opts.map((opt) => opt.value))}
                          placeholder={t('Filter by Tags')}
                        />
                      </Col>
                      <Col>
                        <Select
                          isMulti
                          options={config.RecomendationInfo.benefits.map((b) => ({ value: b, label: t(b) }))}
                          value={benefitForFilter.map((b) => ({ value: b, label: b }))}
                          onChange={(opts) => setBenefitForFilter(opts.map((opt) => opt.value))}
                          placeholder={t('Filter by Benefit')}
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Button variant="outline-secondary" size="sm" onClick={resetAllFilters}>
                          <FaUndo className="me-2" /> {t('Reset filters')}
                        </Button>
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
          </>
        ) : (
          // ───────────────────────── Templates view ─────────────────────────
          <Row className="g-3">
            {/* LEFT: filters + items */}
            <Col xs={12} md={4}>
              <Card className="mb-3">
                <Card.Header>{t('Template filters')}</Card.Header>
                <Card.Body>
                  <Form.Group className="mb-2">
                    <Form.Label>{t('Diagnosis_patient_list')}</Form.Label>
                    <Form.Select
                      value={templateDiag}
                      onChange={(e) => setTemplateDiag(e.target.value)}
                    >
                      <option value="">{t('All')}</option>
                      {diagnoses.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>{t('Horizon (days)')}</Form.Label>
                    <Form.Control
                      type="number"
                      min={14}
                      max={180}
                      value={templateHorizon}
                      onChange={(e) => setTemplateHorizon(parseInt(e.target.value || '84', 10))}
                    />
                  </Form.Group>
                </Card.Body>
              </Card>

              {/* Sub-tab: My Template | Browse All */}
              <Card>
                <Card.Header className="d-flex align-items-center justify-content-between">
                  <div>{t('Content')}</div>
                  <Nav
                    variant="tabs"
                    activeKey={templateLeftTab}
                    onSelect={(k) => setTemplateLeftTab((k as TemplateLeftTab) || 'my')}
                  >
                    <Nav.Item><Nav.Link eventKey="my">{t('My Template')}</Nav.Link></Nav.Item>
                    <Nav.Item><Nav.Link eventKey="all">{t('Browse All')}</Nav.Link></Nav.Item>
                  </Nav>
                </Card.Header>

                {/* My Template list */}
                {templateLeftTab === 'my' && (
                  <Card.Body style={{ maxHeight: 480, overflowY: 'auto' }}>
                    {tLoading && <div className="text-muted">{t('Loading...')}</div>}
                    {!tLoading && templateItems.length === 0 && (
                      <div className="text-muted">{t('No template items')}</div>
                    )}

                    {templateItems.map((it, idx) => {
                      const segments =
                        (Array.isArray((it as any).segments) && (it as any).segments.length)
                          ? (it as any).segments
                          : [{ schedule: it.schedule, from_day: (it as any).from_day || 1, occurrences: it.occurrences }];

                      return (
                        <div
                          key={`${it.intervention._id}-${it.diagnosis}-${idx}`}
                          className="d-flex justify-content-between align-items-start mb-2 p-2 border rounded"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleTemplateItemClick(it)}  // ← use full catalog record
                          title={t('Click to view details')}
                        >

<div>
  <div className="fw-semibold">
    {translatedTitles[it.intervention._id]?.title || it.intervention.title}
    {translatedTitles[it.intervention._id]?.lang && (
      <span className="text-muted ms-2 small">
        ({t('Translated from')}: {translatedTitles[it.intervention._id]?.lang})
      </span>
    )}
  </div>
  <div className="small text-muted">{t('For')}: {it.diagnosis}</div>

  <div className="small text-muted mt-1">
    {getSegments(it).map((seg, i) => (
      <div key={i}>
        {segmentSummary(seg, it, t)}
      </div>
    ))}
  </div>
</div>


                          <div onClick={(e) => e.stopPropagation()}>
                            <ButtonGroup size="sm" vertical>
                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                <Button
                                  variant="outline-secondary"
                                  onClick={() => openModifyTemplate(it)}
                                  title={t('Modify from a specific day onward')}
                                >
                                  <FaEdit />
                                </Button>
                              </OverlayTrigger>
                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
<Button
  variant="outline-danger"
  onClick={() => removeTemplateItem(it.diagnosis, it.intervention._id)}
>
  <FaMinus />
</Button>


                              </OverlayTrigger>
                            </ButtonGroup>
                          </div>
                        </div>
                      );
                    })}
                  </Card.Body>
                )}

                {/* Browse All (with updated filters + conditional Add/Modify/Delete) */}
                {templateLeftTab === 'all' && (
                  <Card.Body className="mb-3">
                    {/* Filters */}
                    <Row className="mb-3">
                      <Col>
                        <Form.Group controlId="tSearchInput">
                          <Form.Control
                            type="text"
                            placeholder={t('Search Interventions')}
                            value={tSearchTerm}
                            onChange={(e) => setTSearchTerm(e.target.value)}
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row className="mb-3">
                      <Col>
                        <Form.Select
                          value={tPatientTypeFilter}
                          onChange={(e) => setTPatientTypeFilter(e.target.value)}
                        >
                          <option value="">{t('Filter by Patient Type')}</option>
                          {diagnoses.map((type: string) => (
                            <option key={type} value={type}>{t(type)}</option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col>
                        <Form.Select
                          value={tContentTypeFilter}
                          onChange={(e) => setTContentTypeFilter(e.target.value)}
                        >
                          <option value="">{t('Filter by Content Type')}</option>
                          {config.RecomendationInfo.types.map((type) => (
                            <option key={type} value={type}>{t(type)}</option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>
                    <Row className="mb-3">
                      <Col>
                        <Select
                          isMulti
                          options={config.RecomendationInfo.tags.map((tag) => ({ value: tag, label: t(tag) }))}
                          value={tTagFilter.map((tag) => ({ value: tag, label: tag }))}
                          onChange={(opts) => setTTagFilter(opts.map((opt) => opt.value))}
                          placeholder={t('Filter by Tags')}
                        />
                      </Col>
                      <Col>
                        <Select
                          isMulti
                          options={config.RecomendationInfo.benefits.map((b) => ({ value: b, label: t(b) }))}
                          value={tBenefitForFilter.map((b) => ({ value: b, label: b }))}
                          onChange={(opts) => setTBenefitForFilter(opts.map((opt) => opt.value))}
                          placeholder={t('Filter by Benefit')}
                        />
                      </Col>
                    </Row>
                    <Row>
                      <Col>
                        <Button variant="outline-secondary" size="sm" onClick={resetTemplateFilters}>
                          <FaUndo className="me-2" /> {t('Reset filters')}
                        </Button>
                      </Col>
                    </Row>

                    {/* List */}
                    <div style={{ maxHeight: 420, overflowY: 'auto' }} className="p-2">
                      {templateFilteredAll.length === 0 && (
                        <div className="text-muted px-2">{t('No interventions match your filters.')}</div>
                      )}

                      {templateFilteredAll.map((intervention) => {
                        const displayTitle =
                          translatedTitles[intervention._id]?.title ?? intervention.title;
                        const entry = findTemplateFor(intervention._id); // ← already in template?
                        const inTemplate = !!entry;

                        return (
                          <div
                            key={intervention._id}
                            className="d-flex justify-content-between align-items-start mb-2 p-2 rounded border"
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleItemClick(intervention)}
                            title={t('Click to view details')}
                          >
                            <div className="me-2">
                              <div className="fw-semibold">
                                {displayTitle}
                                {translatedTitles[intervention._id]?.lang && (
                                  <span className="text-muted ms-2 small">
                                    ({t('Translated from')}: {translatedTitles[intervention._id]?.lang})
                                  </span>
                                )}
                              </div>
                              {intervention.tags?.length > 0 && (
                                <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                                  {intervention.tags.map((tag) => (
                                    <Badge
                                      key={tag}
                                      bg=""
                                      className="me-1"
                                      style={{ backgroundColor: tagColors[tag] || 'gray' }}
                                    >
                                      {t(tag)}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div onClick={(e) => e.stopPropagation()}>
                              {!inTemplate ? (
                                <OverlayTrigger
                                  placement="left"
                                  overlay={<Tooltip>{t('Add this intervention to your template')}</Tooltip>}
                                >
                                  <Button
                                    size="sm"
                                    variant="outline-success"
                                    onClick={() => openAssignToTemplate(intervention._id, 'create')}
                                  >
                                    <FaPlus className="me-1" />
                                  </Button>
                                </OverlayTrigger>
                              ) : (
                                <ButtonGroup size="sm" vertical>
                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                    <Button
                                      variant="outline-secondary"
                                      onClick={() => openModifyTemplate(entry)}
                                      title={t('Modify from a specific day onward')}
                                    >
                                      <FaEdit />
                                    </Button>
                                  </OverlayTrigger>
                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
<Button
  variant="outline-danger"
  onClick={() => removeTemplateItem(entry.diagnosis, intervention._id)}
>
  <FaMinus />
</Button>

                                  </OverlayTrigger>
                                </ButtonGroup>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card.Body>
                )}
              </Card>
            </Col>

            {/* RIGHT: timeline */}
            <Col xs={12} md={8}>
              // RIGHT: timeline
<Card.Body className="min-vh-50" style={{ overflow: 'auto' }}>
  <TemplateTimeline
    items={templateItems}
    horizonDays={templateHorizon}
    translatedTitles={translatedTitles}   // 👈 NEW
  />
</Card.Body>

            </Col>
          </Row>
        )}
      </Container>

      {/* Product details popup */}
      {selectedItem && (
        <ProductPopup
          item={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
          tagColors={tagColors}
        />
      )}

      {/* Add new intervention to catalog */}
      <AddInterventionPopup show={showPopupAdd} handleClose={handleCloseAdd} onSuccess={fetchLibrary} />

      {/* Template assign scheduler */}
      {assignOpen && (
        <TemplateAssignModal
          show
          onHide={() => setAssignOpen(false)}
          interventionId={assignInterventionId}
          diagnoses={diagnoses}
          defaultDiagnosis={templateDiag || undefined}
          mode={assignMode}
          onSuccess={() => fetchTemplates(templateDiag, templateHorizon)}
        />
      )}

      <Footer />
    </div>
  );
};

export default TherapistRecomendations;
