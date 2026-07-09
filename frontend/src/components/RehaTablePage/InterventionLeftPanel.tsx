// src/components/RehaTablePage/InterventionLeftPanel.tsx
import React, { useMemo, useRef } from 'react';
import { Form, Button, ButtonGroup, Dropdown, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Select, { StylesConfig } from 'react-select';
import { TFunction } from 'i18next';
import { FaPlus, FaMinus, FaChartBar, FaEdit, FaUndo, FaGlobe, FaFilter } from 'react-icons/fa';
import StarIcon from '@/assets/icons/interventions/star.svg?react';

import config from '@/config/config.json';
import { Intervention } from '@/types';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type TitleMap = Record<string, { title: string; lang: string | null }>;
type TypeMap = Record<string, string>;
type PatientPlan = { interventions: Intervention[] } & Record<string, any>;

interface LeftPanelData {
  activeItems: Intervention[];
  pastItems: Intervention[];
  visibleItems: Intervention[];
  allItems: Intervention[];
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
  languageFilter: string[];
  setLanguageFilter: (v: string[]) => void;
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
  data: LeftPanelData;
  filters: LeftPanelFilters;
  actions: LeftPanelActions;
  patientData: PatientPlan;
  tagColors: Record<string, string>;
  t: TFunction;
}

/** ───────────────── helpers (new model) ───────────────── */
const norm = (v: any) => (typeof v === 'string' ? v.trim() : '');
const lower = (v: any) => norm(v).toLowerCase();

const sameText = (a: string, b: string) =>
  lower(a).replace(/\s+/g, ' ') === lower(b).replace(/\s+/g, ' ');

const toLangList = (x: any): string[] => {
  if (Array.isArray(x)) return x.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  return [];
};

/** ─────────────────────────────────────────────────────── */

const InterventionLeftPanel: React.FC<InterventionLeftPanelProps> = ({
  data,
  filters,
  actions,
  patientData,
  t,
}) => {
  const { activeItems, pastItems, visibleItems, allItems, titleMap, typeMap, diagnoses } = data;

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
    languageFilter,
    setLanguageFilter,
    resetAllFilters,
  } = filters;

  const languageOptions = useMemo(() => {
    const langs = allItems
      .flatMap((item: any) => [
        ...toLangList(item.available_languages),
        ...(item.language ? [String(item.language).trim().toLowerCase()] : []),
      ])
      .filter(Boolean);
    return [...new Set(langs)].sort().map((l) => ({ value: l, label: l.toUpperCase() }));
  }, [allItems]);

  const {
    handleExerciseClick,
    showStats,
    openFeedbackBrowser,
    handleModifyIntervention,
    handleDeleteExercise,
    handleAddIntervention,
  } = actions;

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
    intervention: any,
    opts: {
      isPastSection?: boolean;
      inAllTab?: boolean;
      showScheduleAgain?: boolean;
    } = {}
  ) => {
    const translated = titleMap[intervention._id];
    const title = translated?.title || intervention.title || '';
    const original = intervention.title || '';

    const isTranslated = Boolean(translated?.lang) && !sameText(title, original);

    const typeLabel = typeMap[intervention._id] || intervention.content_type || '';

    const patientHasIntervention =
      patientData?.interventions?.find((item: any) => item._id === intervention._id) || null;
    const assigned = !!patientHasIntervention;
    const hasFuture =
      patientHasIntervention?.dates?.some((d: any) => new Date(d.datetime) > new Date()) || false;

    const langs = toLangList(intervention?.available_languages);
    const langLabel = String(intervention?.language || '').toUpperCase();

    return (
      <Card
        key={intervention._id}
        role="button"
        tabIndex={0}
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => handleExerciseClick(intervention)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleExerciseClick(intervention);
          }
        }}
        aria-label={t('Intervention')}
      >
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">
            {isTranslated ? (
              <OverlayTrigger overlay={<Tooltip>{original}</Tooltip>}>
                <div>{title}</div>
              </OverlayTrigger>
            ) : (
              <div>{title}</div>
            )}
          </CardTitle>
          <CardDescription>
            {/* Meta row: content type + language info */}
            <div className="text-zinc-500 text-xs flex items-center gap-2 flex-wrap">
              <span>{t(String(typeLabel))}</span>
              <span>·</span>

              {!!langLabel && (
                <span className="flex items-center gap-1">
                  <FaGlobe />
                  {langs.length > 0 ? langs.map((l) => l.toUpperCase()).join(', ') : langLabel}
                </span>
              )}
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div onClick={(e) => e.stopPropagation()}>
            <ButtonGroup size="sm">
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
                      variant="outline-primary"
                      onClick={() => openFeedbackBrowser(intervention)}
                      aria-label={t('Feedback')}
                    >
                      <StarIcon className="w-4 h-4 text-yellow" />
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
        </CardContent>
      </Card>
    );
  };

  const activeFiltersCount =
    (patientTypeFilter ? 1 : 0) +
    (contentTypeFilter ? 1 : 0) +
    (tagFilter?.length ? 1 : 0) +
    (benefitForFilter?.length ? 1 : 0) +
    (languageFilter?.length ? 1 : 0);

  const selectStyles: StylesConfig<{ value: string; label: string }, true> = {
    container: (base) => ({ ...base, width: '100%', minWidth: 0 }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
  };

  const renderFiltersBar = () => (
    <div className="d-flex align-items-center gap-2">
      <Form.Group controlId="searchInput" className="flex-grow-1">
        <Form.Control
          type="text"
          placeholder={t('Search Interventions')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Form.Group>

      <Dropdown align="end">
        <Dropdown.Toggle as={Button} variant="outline-secondary" size="sm">
          <FaFilter className="me-2" />
          {t('Filters')}
          {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
        </Dropdown.Toggle>

        <Dropdown.Menu className="p-3 w-[min(420px,86vw)]" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-2.5">
            <Form.Group controlId="patientTypeFilter">
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
            </Form.Group>

            <Form.Group controlId="contentTypeFilter">
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
            </Form.Group>

            <Form.Group controlId="tagFilter">
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
                styles={selectStyles}
                menuPortalTarget={document.body}
              />
            </Form.Group>

            <Form.Group controlId="benefitForFilter">
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
                styles={selectStyles}
                menuPortalTarget={document.body}
              />
            </Form.Group>

            <Form.Group controlId="languageFilter" className="col-span-2">
              <Select
                classNamePrefix="select"
                isMulti
                options={languageOptions}
                value={languageFilter.map((l) => ({ value: l, label: l.toUpperCase() }))}
                onChange={(opts) => setLanguageFilter((opts || []).map((opt: any) => opt.value))}
                placeholder={t('Filter by Language')}
                styles={selectStyles}
                menuPortalTarget={document.body}
              />
            </Form.Group>

            <div className="col-span-2 d-flex justify-content-between">
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
            </div>
          </div>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );

  return (
    <div className="flex flex-column gap-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('Active interventions')}</CardTitle>
          <CardAction>
            <Badge variant="dashboard">{activeItems.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 max-h-96 overflow-auto">
          {activeItems.length === 0 ? (
            <div className="text-zinc-500">{t('No active interventions.')}</div>
          ) : (
            activeItems.map((it: any) => renderInterventionCard(it))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Past interventions')}</CardTitle>
          <CardAction>
            <Badge variant="dashboard">{pastItems.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 max-h-96 overflow-auto">
          {pastItems.length === 0 ? (
            <div className="text-zinc-500">{t('No past interventions.')}</div>
          ) : (
            pastItems.map((it: any) =>
              renderInterventionCard(it, { isPastSection: true, showScheduleAgain: true })
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('All interventions')}</CardTitle>
          <CardAction>
            <Badge variant="dashboard">{visibleItems.length}</Badge>
          </CardAction>
          {renderFiltersBar()}
        </CardHeader>
        <CardContent className="flex flex-col gap-2 h-96 overflow-auto">
          {visibleItems.length === 0 ? (
            <div className="text-zinc-500">{t('No interventions match the filters.')}</div>
          ) : (
            visibleItems.map((it: any) => renderInterventionCard(it, { inAllTab: true }))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InterventionLeftPanel;
