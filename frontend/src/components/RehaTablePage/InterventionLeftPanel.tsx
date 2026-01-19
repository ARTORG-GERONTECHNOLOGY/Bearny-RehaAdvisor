// src/components/RehaTablePage/InterventionLeftPanel.tsx
import React, { useRef } from 'react';
import {
  Card,
  Nav,
  Row,
  Col,
  Form,
  Button,
  Badge,
  ButtonGroup,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';
import Select from 'react-select';
import { TFunction } from 'i18next';
import {
  FaPlus,
  FaMinus,
  FaChartBar,
  FaEdit,
  FaCommentDots,
  FaUndo,
} from 'react-icons/fa';

import config from '../../config/config.json';
import { Intervention } from '../../types';
import { getBadgeVariantFromUrl, getMediaTypeLabelFromUrl } from '../../utils/interventions';

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap = Record<string, string>;
type PatientPlan = { interventions: Intervention[] } & Record<string, any>;

interface LeftPanelData {
  activeItems: Intervention[];
  pastItems: Intervention[];
  visibleItems: Intervention[];
  titleMap: TitleMap;
  typeMap: TypeMap;
  diagnoses: string[];
}

interface LeftPanelFilters {
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  patientTypeFilter: string;
  setPatientTypeFilter: (v: string) => void;
  contentTypeFilter: string;
  setContentTypeFilter: (v: string) => void;
  tagFilter: string[];
  setTagFilter: (v: string[]) => void;
  benefitForFilter: string[];
  setBenefitForFilter: (v: string[]) => void;
  resetAllFilters: () => void;
}

interface LeftPanelActions {
  handleExerciseClick: (intervention: Intervention) => void;
  showStats: (intervention: Intervention) => void;
  openFeedbackBrowser: (intervention: Intervention) => void;
  handleModifyIntervention: (intervention: Intervention) => void;
  handleDeleteExercise: (id: string) => void;
  handleAddIntervention: (intervention: Intervention) => void;
}

interface InterventionLeftPanelProps {
  selectedTab: 'patient' | 'all';
  setSelectedTab: (tab: 'patient' | 'all') => void;
  data: LeftPanelData;
  filters: LeftPanelFilters;
  actions: LeftPanelActions;
  patientData: PatientPlan;
  t: TFunction;
}

const InterventionLeftPanel: React.FC<InterventionLeftPanelProps> = ({
  selectedTab,
  setSelectedTab,
  data,
  filters,
  actions,
  patientData,
  t,
}) => {
  const {
    activeItems,
    pastItems,
    visibleItems,
    titleMap,
    typeMap,
    diagnoses,
  } = data;

  const {
    searchTerm,
    setSearchTerm,
    patientTypeFilter,
    setPatientTypeFilter,
    contentTypeFilter,
    setContentTypeFilter,
    tagFilter,
    setTagFilter,
    benefitForFilter,
    setBenefitForFilter,
    resetAllFilters,
  } = filters;

  const {
    handleExerciseClick,
    showStats,
    openFeedbackBrowser,
    handleModifyIntervention,
    handleDeleteExercise,
    handleAddIntervention,
  } = actions;

  // Scroll-to-top targets
  const allListRef = useRef<HTMLDivElement | null>(null);
  const patientListRef = useRef<HTMLDivElement | null>(null);

  const scrollListToTop = () => {
    const el = selectedTab === 'all' ? allListRef.current : patientListRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    resetAllFilters();      // clears controlled fields in parent
    scrollListToTop();      // scroll list back to top (ALL tab mainly)
  };

  return (
    <div className="left-bar-wrapper">
      <div className="left-bar-inner">
        {/* Tabs: Patient / All */}
        <Card className="mb-3">
          <Card.Header>
            <Nav
              variant="tabs"
              activeKey={selectedTab}
              onSelect={(k) => setSelectedTab((k as 'patient' | 'all') || 'patient')}
            >
              <Nav.Item>
                <Nav.Link eventKey="patient">
                  {t("Patient's Interventions")}
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="all">{t('All Interventions')}</Nav.Link>
              </Nav.Item>
            </Nav>
          </Card.Header>
        </Card>

        {/* Filters – only for ALL tab */}
        {selectedTab === 'all' && (
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
                      <option key={type} value={type}>
                        {t(type)}
                      </option>
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
                    options={config.RecomendationInfo.tags.map((tag) => ({
                      value: tag,
                      label: t(tag),
                    }))}
                    // IMPORTANT: keep labels translated (so UI stays consistent after reset)
                    value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
                    onChange={(opts) => setTagFilter((opts || []).map((opt: any) => opt.value))}
                    placeholder={t('Filter by Tags')}
                  />
                </Col>

                <Col>
                  <Select
                    isMulti
                    options={config.RecomendationInfo.benefits.map((b) => ({
                      value: b,
                      label: t(b),
                    }))}
                    value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
                    onChange={(opts) => setBenefitForFilter((opts || []).map((opt: any) => opt.value))}
                    placeholder={t('Filter by Benefit')}
                  />
                </Col>
              </Row>

              <Row>
                <Col className="d-flex gap-2">
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handleReset}
                  >
                    <FaUndo className="me-2" /> {t('Reset filters')}
                  </Button>

                  {/* Optional: quick scroll-to-top even without reset */}
                  <Button
                    variant="outline-light"
                    size="sm"
                    onClick={scrollListToTop}
                    aria-label={t('Scroll to top')}
                    title={t('Scroll to top')}
                  >
                    ↑
                  </Button>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        )}

        {/* Patient view: Active vs Past */}
        {selectedTab === 'patient' ? (
          <Card className="d-flex flex-column flex-1 min-h-0">
            <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
              <div className="flex-1 min-h-0 scroll-y" ref={patientListRef}>
                {/* Active */}
                <div className="mb-2">
                  <div className="fw-bold mb-2">{t('Active interventions')}</div>

                  {activeItems.length === 0 && (
                    <div className="text-muted mb-3">{t('No active interventions.')}</div>
                  )}

                  {activeItems.map((intervention) => {
                    const translated = titleMap[intervention._id];
                    const title = translated?.title || intervention.title;
                    const originalLang = translated?.lang;
                    const isTranslated =
                      originalLang &&
                      title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();

                    const typeLabel =
                      typeMap[intervention._id] || capitalize(intervention.content_type || '');

                    const patientHasIntervention =
                      patientData?.interventions?.find((item) => item._id === intervention._id);

                    const hasFuture =
                      patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date());

                    const assigned = !!patientHasIntervention;

                    return (
                      <div
                        key={intervention._id}
                        className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
                        style={{
                          cursor: 'pointer',
                          backgroundColor: '#f8f9fa',
                          gap: '0.5rem',
                        }}
                        onClick={() => handleExerciseClick(intervention)}
                      >
                        <div className="flex-grow-1">
                          <strong {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}>
                            {title}
                          </strong>

                          {isTranslated && (
                            <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
                              ({t('Translated from')}: {originalLang})
                            </div>
                          )}

                          <div className="text-muted">{typeLabel}</div>

                          <Badge
                            bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}
                          >
                            {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
                          </Badge>
                        </div>

                        <div style={{ flex: '0 0 auto' }}>
                          <div onClick={(e) => e.stopPropagation()} className="ms-2">
                            <ButtonGroup size="sm" vertical>
                              {assigned && (
                                <>
                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                                    <Button
                                      variant="outline-primary"
                                      onClick={() => showStats(intervention)}
                                      aria-label={t('Statistics')}
                                    >
                                      <FaChartBar />
                                    </Button>
                                  </OverlayTrigger>

                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Feedback')}</Tooltip>}>
                                    <Button
                                      variant="outline-info"
                                      onClick={() => openFeedbackBrowser(intervention)}
                                      aria-label={t('Feedback')}
                                    >
                                      <FaCommentDots />
                                    </Button>
                                  </OverlayTrigger>
                                </>
                              )}

                              {assigned && hasFuture && (
                                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                  <Button
                                    variant="outline-secondary"
                                    onClick={() => handleModifyIntervention(intervention)}
                                    aria-label={t('Modify')}
                                  >
                                    <FaEdit />
                                  </Button>
                                </OverlayTrigger>
                              )}

                              {hasFuture && (
                                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                  <Button
                                    variant="outline-danger"
                                    onClick={() => handleDeleteExercise(intervention._id)}
                                    aria-label={t('Remove')}
                                  >
                                    <FaMinus />
                                  </Button>
                                </OverlayTrigger>
                              )}
                            </ButtonGroup>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Past */}
                <hr className="my-3" />
                <div className="mb-2">
                  <div className="fw-bold mb-2">{t('Past interventions')}</div>

                  {pastItems.length === 0 && (
                    <div className="text-muted">{t('No past interventions.')}</div>
                  )}

                  {pastItems.map((intervention) => {
                    const translated = titleMap[intervention._id];
                    const title = translated?.title || intervention.title;
                    const originalLang = translated?.lang;
                    const isTranslated =
                      originalLang &&
                      title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();

                    const typeLabel =
                      typeMap[intervention._id] || capitalize(intervention.content_type || '');

                    const patientHasIntervention =
                      patientData?.interventions?.find((item) => item._id === intervention._id);
                    const assigned = !!patientHasIntervention;

                    return (
                      <div
                        key={intervention._id}
                        className="d-flex justify-content-between align-items-start mb-2 p-2 rounded border"
                        style={{
                          cursor: 'pointer',
                          backgroundColor: '#fcfcfd',
                          gap: '0.5rem',
                        }}
                        onClick={() => handleExerciseClick(intervention)}
                      >
                        <div className="flex-grow-1">
                          <strong {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}>
                            {title}
                          </strong>

                          {isTranslated && (
                            <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
                              ({t('Translated from')}: {originalLang})
                            </div>
                          )}

                          <div className="text-muted">{typeLabel}</div>

                          <Badge
                            bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}
                          >
                            {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
                          </Badge>
                        </div>

                        <div style={{ flex: '0 0 auto' }}>
                          <div onClick={(e) => e.stopPropagation()} className="ms-2">
                            <ButtonGroup size="sm" vertical>
                              {assigned && (
                                <>
                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                                    <Button
                                      variant="outline-primary"
                                      onClick={() => showStats(intervention)}
                                      aria-label={t('Statistics')}
                                    >
                                      <FaChartBar />
                                    </Button>
                                  </OverlayTrigger>

                                  <OverlayTrigger placement="left" overlay={<Tooltip>{t('Feedback')}</Tooltip>}>
                                    <Button
                                      variant="outline-info"
                                      onClick={() => openFeedbackBrowser(intervention)}
                                      aria-label={t('Feedback')}
                                    >
                                      <FaCommentDots />
                                    </Button>
                                  </OverlayTrigger>
                                </>
                              )}

                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Schedule again')}</Tooltip>}>
                                <Button
                                  variant="outline-success"
                                  onClick={() => handleAddIntervention(intervention)}
                                  aria-label={t('Schedule again')}
                                >
                                  <FaPlus />
                                </Button>
                              </OverlayTrigger>
                            </ButtonGroup>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card.Body>
          </Card>
        ) : (
          // ALL tab list
          <Card className="d-flex flex-column flex-1 min-h-0">
            <Card.Body className="d-flex flex-column flex-1 min-h-0 p-2">
              <div className="flex-1 min-h-0 all-scroll-y" ref={allListRef}>
                {visibleItems.map((intervention) => {
                  const translated = titleMap[intervention._id];
                  const title = translated?.title || intervention.title;
                  const originalLang = translated?.lang;
                  const isTranslated =
                    originalLang &&
                    title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();

                  const typeLabel =
                    typeMap[intervention._id] || capitalize(intervention.content_type || '');

                  const patientHasIntervention =
                    patientData?.interventions?.find((item) => item._id === intervention._id);

                  const hasFuture =
                    patientHasIntervention?.dates?.some((d) => new Date(d.datetime) > new Date()) || false;

                  const assigned = !!patientHasIntervention;

                  return (
                    <div
                      key={intervention._id}
                      className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
                      style={{
                        cursor: 'pointer',
                        backgroundColor: '#f8f9fa',
                        gap: '0.5rem',
                      }}
                      onClick={() => handleExerciseClick(intervention)}
                    >
                      <div className="flex-grow-1">
                        <strong {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}>
                          {title}
                        </strong>

                        {isTranslated && (
                          <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
                            ({t('Translated from')}: {originalLang})
                          </div>
                        )}

                        <div className="text-muted">{typeLabel}</div>

                        <Badge
                          bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}
                        >
                          {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
                        </Badge>
                      </div>

                      <div style={{ flex: '0 0 auto' }}>
                        <div onClick={(e) => e.stopPropagation()} className="ms-2">
                          <ButtonGroup size="sm" vertical>
                            {assigned && (
                              <>
                                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Statistics')}</Tooltip>}>
                                  <Button
                                    variant="outline-primary"
                                    onClick={() => showStats(intervention)}
                                    aria-label={t('Statistics')}
                                  >
                                    <FaChartBar />
                                  </Button>
                                </OverlayTrigger>

                                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Feedback')}</Tooltip>}>
                                  <Button
                                    variant="outline-info"
                                    onClick={() => openFeedbackBrowser(intervention)}
                                    aria-label={t('Feedback')}
                                  >
                                    <FaCommentDots />
                                  </Button>
                                </OverlayTrigger>
                              </>
                            )}

                            {assigned && hasFuture ? (
                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                                <Button
                                  variant="outline-secondary"
                                  onClick={() => handleModifyIntervention(intervention)}
                                  aria-label={t('Modify')}
                                >
                                  <FaEdit />
                                </Button>
                              </OverlayTrigger>
                            ) : assigned ? (
                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                                <Button
                                  variant="outline-danger"
                                  onClick={() => handleDeleteExercise(intervention._id)}
                                  aria-label={t('Remove')}
                                >
                                  <FaMinus />
                                </Button>
                              </OverlayTrigger>
                            ) : (
                              <OverlayTrigger placement="left" overlay={<Tooltip>{t('Add')}</Tooltip>}>
                                <Button
                                  variant="outline-success"
                                  onClick={() => handleAddIntervention(intervention)}
                                  aria-label={t('Add')}
                                >
                                  <FaPlus />
                                </Button>
                              </OverlayTrigger>
                            )}
                          </ButtonGroup>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card.Body>
          </Card>
        )}
      </div>
    </div>
  );
};

export default InterventionLeftPanel;
