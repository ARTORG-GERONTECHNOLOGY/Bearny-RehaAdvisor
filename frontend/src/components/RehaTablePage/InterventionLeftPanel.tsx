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
import { Accordion } from 'react-bootstrap';

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
  const { activeItems, pastItems, visibleItems, titleMap, typeMap, diagnoses } = data;

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

  // Scroll-to-top targets (we scroll the list wrapper only)
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollListToTop = () => {
    const el = listScrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleReset = () => {
    resetAllFilters();
    scrollListToTop();
  };

  const renderInterventionCard = (
    intervention: Intervention,
    opts: {
      isPastSection?: boolean;
      inAllTab?: boolean;
      showScheduleAgain?: boolean;
    } = {}
  ) => {
    const translated = titleMap[intervention._id];
    const title = translated?.title || intervention.title;
    const originalLang = translated?.lang;
    const isTranslated =
      !!originalLang &&
      title.trim().toLowerCase() !== intervention.title.trim().toLowerCase();

    const typeLabel = typeMap[intervention._id] || capitalize(intervention.content_type || '');

    const patientHasIntervention =
      patientData?.interventions?.find((item) => item._id === intervention._id) || null;

    const assigned = !!patientHasIntervention;

    const hasFuture =
      patientHasIntervention?.dates?.some((d: any) => new Date(d.datetime) > new Date()) || false;

    const bg = opts.isPastSection ? '#fcfcfd' : '#f8f9fa';

    return (
      <div
        key={intervention._id}
        className="d-flex justify-content-between align-items-start mb-2 p-2 rounded shadow-sm"
        style={{
          cursor: 'pointer',
          backgroundColor: bg,
          gap: '0.5rem',
        }}
        onClick={() => handleExerciseClick(intervention)}
      >
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <strong
            {...(isTranslated ? { title: `Original: ${intervention.title}` } : {})}
            style={{ display: 'block' }}
          >
            {title}
          </strong>

          {isTranslated && (
            <div className="text-muted fst-italic" style={{ fontSize: '0.85rem' }}>
              ({t('Translated from')}: {originalLang})
            </div>
          )}

          <div className="text-muted">{typeLabel}</div>

          <Badge bg={getBadgeVariantFromUrl(intervention.media_url, intervention.link)}>
            {t(getMediaTypeLabelFromUrl(intervention.media_url, intervention.link))}
          </Badge>
        </div>

        <div style={{ flex: '0 0 auto' }}>
          <div onClick={(e) => e.stopPropagation()} className="ms-2">
            <ButtonGroup size="sm" vertical>
              {/* Stats/Feedback only when assigned */}
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

              {/* Modify only if assigned AND has future */}
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

              {/* Patient tab past section: schedule again */}
              {opts.showScheduleAgain ? (
                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Schedule again')}</Tooltip>}>
                  <Button
                    variant="outline-success"
                    onClick={() => handleAddIntervention(intervention)}
                    aria-label={t('Schedule again')}
                  >
                    <FaPlus />
                  </Button>
                </OverlayTrigger>
              ) : null}

              {/* ALL tab behavior for + / - */}
              {opts.inAllTab ? (
                assigned ? (
                  hasFuture ? (
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
                    <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                      <Button
                        variant="outline-danger"
                        onClick={() => handleDeleteExercise(intervention._id)}
                        aria-label={t('Remove')}
                      >
                        <FaMinus />
                      </Button>
                    </OverlayTrigger>
                  )
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
                )
              ) : null}

              {/* Patient tab active section remove only if hasFuture */}
              {!opts.inAllTab && !opts.showScheduleAgain && hasFuture ? (
                <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                  <Button
                    variant="outline-danger"
                    onClick={() => handleDeleteExercise(intervention._id)}
                    aria-label={t('Remove')}
                  >
                    <FaMinus />
                  </Button>
                </OverlayTrigger>
              ) : null}
            </ButtonGroup>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="left-bar-wrapper">
      <div className="left-bar-inner">
        {/* ✅ Sticky block: Tabs + (optional) Filters */}
        <div className="rehaLeftSticky">
          <Card className="mb-3">
            <Card.Header>
              <Nav
                variant="tabs"
                activeKey={selectedTab}
                onSelect={(k) => setSelectedTab((k as 'patient' | 'all') || 'patient')}
              >
                <Nav.Item>
                  <Nav.Link eventKey="patient">{t("Patient's Interventions")}</Nav.Link>
                </Nav.Item>
                <Nav.Item>
                  <Nav.Link eventKey="all">{t('All Interventions')}</Nav.Link>
                </Nav.Item>
              </Nav>
            </Card.Header>
          </Card>

          {/* Filters – ONLY for ALL tab */}
          {/* Filters – ONLY for ALL tab */}
{selectedTab === 'all' ? (
  <Accordion alwaysOpen={false} className="mb-3 rehaFiltersAccordion">
    <Accordion.Item eventKey="filters">
      <Accordion.Header>{t('Filters')}</Accordion.Header>

      <Accordion.Body>
        <Row className="mb-2">
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

        <Row className="mb-2">
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

        <Row className="mb-2">
          <Col>
            <Select
              classNamePrefix="select"
              isMulti
              options={config.RecomendationInfo.tags.map((tag) => ({
                value: tag,
                label: t(tag),
              }))}
              value={tagFilter.map((tag) => ({ value: tag, label: t(tag) }))}
              onChange={(opts) => setTagFilter((opts || []).map((opt: any) => opt.value))}
              placeholder={t('Filter by Tags')}
              styles={{
                container: (base) => ({ ...base, width: '100%', maxWidth: '100%' }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              menuPortalTarget={document.body}
            />
          </Col>

          <Col>
            <Select
              classNamePrefix="select"
              isMulti
              options={config.RecomendationInfo.benefits.map((b) => ({
                value: b,
                label: t(b),
              }))}
              value={benefitForFilter.map((b) => ({ value: b, label: t(b) }))}
              onChange={(opts) => setBenefitForFilter((opts || []).map((opt: any) => opt.value))}
              placeholder={t('Filter by Benefit')}
              styles={{
                container: (base) => ({ ...base, width: '100%', maxWidth: '100%' }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
              }}
              menuPortalTarget={document.body}
            />
          </Col>
        </Row>

        <Row>
          <Col className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" onClick={handleReset}>
              <FaUndo className="me-2" /> {t('Reset filters')}
            </Button>

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
      </Accordion.Body>
    </Accordion.Item>
  </Accordion>
) : null}

        </div>

        {/* ✅ Scroll area: ONLY lists */}
        <div className="rehaLeftListScroll" ref={listScrollRef}>
          {selectedTab === 'patient' ? (
            <>
              {/* Active */}
              <div className="mb-2">
                <div className="fw-bold mb-2">{t('Active interventions')}</div>
                {activeItems.length === 0 ? (
                  <div className="text-muted mb-3">{t('No active interventions.')}</div>
                ) : (
                  activeItems.map((it) => renderInterventionCard(it))
                )}
              </div>

              {/* Past */}
              <hr className="my-3" />
              <div className="mb-2">
                <div className="fw-bold mb-2">{t('Past interventions')}</div>
                {pastItems.length === 0 ? (
                  <div className="text-muted">{t('No past interventions.')}</div>
                ) : (
                  pastItems.map((it) =>
                    renderInterventionCard(it, { isPastSection: true, showScheduleAgain: true })
                  )
                )}
              </div>
            </>
          ) : (
            <>
              {/* ALL */}
              {visibleItems.map((it) => renderInterventionCard(it, { inAllTab: true }))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InterventionLeftPanel;
