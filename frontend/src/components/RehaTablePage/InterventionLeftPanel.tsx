// src/components/RehaTablePage/InterventionLeftPanel.tsx
import React, { useMemo, useRef, useState } from 'react';
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ButtonGroup } from '@/components/ui/button-group';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// Sentinel for the "clear filter" Select item — Radix forbids an empty-string item value.
const ALL_FILTER_VALUE = '__all__';

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

  const [filtersOpen, setFiltersOpen] = useState(false);

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
          if (e.currentTarget !== e.target) return;
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>{title}</div>
                </TooltipTrigger>
                <TooltipContent>{original}</TooltipContent>
              </Tooltip>
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
          <div onClick={(e) => e.stopPropagation()} className="text-right">
            <ButtonGroup>
              {/* Stats/Feedback only when assigned */}
              {assigned && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => showStats(intervention)}
                        aria-label={t('Statistics')}
                        className="px-3"
                      >
                        <FaChartBar className="text-pink" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Statistics')}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => openFeedbackBrowser(intervention)}
                        aria-label={t('Feedback')}
                        className="px-3"
                      >
                        <StarIcon className="text-yellow" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Feedback')}</TooltipContent>
                  </Tooltip>
                </>
              )}

              {/* Modify only if assigned AND has future */}
              {assigned && hasFuture && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={() => handleModifyIntervention(intervention)}
                      aria-label={t('Modify')}
                      className="px-3"
                    >
                      <FaEdit />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Modify')}</TooltipContent>
                </Tooltip>
              )}

              {/* Patient tab past section: schedule again */}
              {opts.showScheduleAgain ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={() => handleAddIntervention(intervention)}
                      aria-label={t('Schedule again')}
                      className="px-3"
                    >
                      <FaPlus className="text-ok" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Schedule again')}</TooltipContent>
                </Tooltip>
              ) : null}

              {/* ALL tab behavior for + / - */}
              {opts.inAllTab ? (
                assigned ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => handleDeleteExercise(intervention._id)}
                        aria-label={t('Remove')}
                        className="px-3"
                      >
                        <FaMinus className="text-nok" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Remove')}</TooltipContent>
                  </Tooltip>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => handleAddIntervention(intervention)}
                        aria-label={t('Add')}
                        className="px-3"
                      >
                        <FaPlus className="text-ok" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('Add')}</TooltipContent>
                  </Tooltip>
                )
              ) : null}

              {/* Patient tab active section remove only if hasFuture */}
              {!opts.inAllTab && !opts.showScheduleAgain && hasFuture ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="dashboard"
                      variant="secondary"
                      onClick={() => handleDeleteExercise(intervention._id)}
                      aria-label={t('Remove')}
                      className="px-3"
                    >
                      <FaMinus className="text-nok" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('Remove')}</TooltipContent>
                </Tooltip>
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
    <div className="flex items-center gap-2">
      <Field className="grow">
        <Input
          id="searchInput"
          type="text"
          placeholder={t('Search Interventions')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </Field>

      <DropdownMenu open={filtersOpen} onOpenChange={setFiltersOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="dashboard">
            <FaFilter />
            {t('Filters')}
            {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="p-3 w-[min(420px,86vw)]">
          <div className="grid grid-cols-2 gap-2.5">
            <Field>
              <UiSelect
                value={patientTypeFilter || ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  setPatientTypeFilter(value === ALL_FILTER_VALUE ? '' : value)
                }
              >
                <SelectTrigger id="patientTypeFilter">
                  <SelectValue placeholder={t('Filter by Patient Type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t('All Patient Types')}</SelectItem>
                  {diagnoses.map((type: string) => (
                    <SelectItem key={type} value={type}>
                      {t(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </Field>

            <Field>
              <UiSelect
                value={contentTypeFilter || ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  setContentTypeFilter(value === ALL_FILTER_VALUE ? '' : value)
                }
              >
                <SelectTrigger id="contentTypeFilter">
                  <SelectValue placeholder={t('Filter by Content Type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{t('All Content Types')}</SelectItem>
                  {config.RecomendationInfo.types.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </Field>

            <Field>
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
            </Field>

            <Field>
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
            </Field>

            <Field className="col-span-2">
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
            </Field>

            <div className="col-span-2 flex justify-between">
              <Button variant="secondary" size="dashboard" onClick={handleReset}>
                <FaUndo /> {t('Reset filters')}
              </Button>

              <Button
                variant="secondary"
                size="dashboard"
                onClick={scrollListToTop}
                aria-label={t('Scroll to top')}
                title={t('Scroll to top')}
              >
                ↑
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
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
              pastItems.map((it: any) => renderInterventionCard(it, { showScheduleAgain: true }))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t('All interventions')}</CardTitle>
            <CardAction>
              <Badge variant="dashboard">{visibleItems.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {renderFiltersBar()}
            <div className="mt-3 flex flex-col gap-2 h-96 overflow-auto" ref={listScrollRef}>
              {visibleItems.length === 0 ? (
                <div className="text-zinc-500">{t('No interventions match the filters.')}</div>
              ) : (
                visibleItems.map((it: any) => renderInterventionCard(it, { inAllTab: true }))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default InterventionLeftPanel;
