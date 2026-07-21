// components/TherapistInterventionPage/FilterBar.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import interventionsConfig from '../../config/interventions.json';
import { FaFilter } from 'react-icons/fa';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Sentinel for the "clear filter" Select item — Radix forbids an empty-string item value.
const ALL_CONTENT_TYPES = '__all__';

interface Props {
  searchTerm: string;
  setSearchTerm: (val: string) => void;

  diagnosisFilter: string[];
  setDiagnosisFilter: (val: string[]) => void;

  languageFilter?: string[];
  setLanguageFilter?: (val: string[]) => void;

  contentTypeFilter: string;
  setContentTypeFilter: (val: string) => void;

  tagFilter: string[];
  setTagFilter: (val: string[]) => void;

  t: (key: string) => string;

  onReset?: () => void;
  resultCount?: number;
  loading?: boolean;
}

const FilterBar: React.FC<Props> = ({
  searchTerm,
  setSearchTerm,
  diagnosisFilter,
  setDiagnosisFilter,
  languageFilter,
  setLanguageFilter,
  contentTypeFilter,
  setContentTypeFilter,
  tagFilter,
  setTagFilter,
  t,
  onReset,
  resultCount,
  loading,
}) => {
  const tx = (interventionsConfig as any)?.interventionsTaxonomy || {};

  const diagnosisOptions = useMemo(
    () => (Array.isArray(tx.primary_diagnoses) ? tx.primary_diagnoses : []),
    [tx]
  );

  const contentTypes: string[] = Array.isArray(tx.content_types) ? tx.content_types : [];

  const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => String(x)).filter(Boolean)));

  const tagBuckets = [
    ...(Array.isArray(tx.topics) ? tx.topics : []),
    ...(Array.isArray(tx.cognitive_levels) ? tx.cognitive_levels : []),
    ...(Array.isArray(tx.physical_levels) ? tx.physical_levels : []),
    ...(Array.isArray(tx.duration_buckets) ? tx.duration_buckets : []),
    ...(Array.isArray(tx.sex_specific) ? tx.sex_specific : []),
    ...(Array.isArray(tx.where) ? tx.where : []),
    ...(Array.isArray(tx.setting) ? tx.setting : []),
    ...(Array.isArray(tx.input_from) ? tx.input_from : []),
  ];

  const tagOptions = uniq(tagBuckets).map((tag) => ({ value: tag, label: t(tag) }));

  const selectStyles = {
    container: (base: any) => ({ ...base, width: '100%', minWidth: 0 }),
    control: (base: any) => ({ ...base, minHeight: 38 }),
    valueContainer: (base: any) => ({ ...base, minWidth: 0 }),
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
  };

  // --- container-width aware narrow mode ---
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isNarrow, setIsNarrow] = useState(false);

  // dropdown open state (controlled so it won't “flash close”)
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      const narrowNow = w < 520;
      setIsNarrow(narrowNow);

      // close dropdown when switching layout to narrow/non-narrow
      // (but DO NOT auto-close on every resize while narrow)
      if (!narrowNow) setOpen(false);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const languageOptions = useMemo(
    () =>
      (Array.isArray(tx.languages) ? tx.languages : []).map((l: string) => ({
        value: l,
        label: l.toUpperCase(),
      })),
    [tx]
  );

  const activeFiltersCount =
    (diagnosisFilter?.length ? 1 : 0) +
    (languageFilter?.length ? 1 : 0) +
    (contentTypeFilter ? 1 : 0) +
    (tagFilter?.length ? 1 : 0);

  const FiltersGrid = (
    <div className="grid grid-cols-2 gap-3">
      <Field>
        <FieldLabel htmlFor="filterDiagnosis" className="sr-only">
          {t('Filter by Primary Diagnosis')}
        </FieldLabel>
        <Select
          inputId="filterDiagnosis"
          isMulti
          placeholder={t('Filter by Primary Diagnosis')}
          options={diagnosisOptions.map((d: string) => ({ value: d, label: t(d) }))}
          value={(diagnosisFilter || []).map((d) => ({ value: d, label: t(d) }))}
          onChange={(opts) => setDiagnosisFilter((opts || []).map((o: any) => o.value))}
          styles={selectStyles}
          menuPortalTarget={document.body}
        />
      </Field>

      {setLanguageFilter && (
        <Field>
          <FieldLabel htmlFor="filterLanguage" className="sr-only">
            {t('Filter by Language')}
          </FieldLabel>
          <Select
            inputId="filterLanguage"
            isMulti
            placeholder={t('Filter by Language')}
            options={languageOptions}
            value={(languageFilter || []).map((l) => ({ value: l, label: l.toUpperCase() }))}
            onChange={(opts) => setLanguageFilter((opts || []).map((o: any) => o.value))}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </Field>
      )}

      <Field>
        <FieldLabel htmlFor="filterContentType" className="sr-only">
          {t('Filter by Content Type')}
        </FieldLabel>
        <UiSelect
          value={contentTypeFilter || ALL_CONTENT_TYPES}
          onValueChange={(value) => setContentTypeFilter(value === ALL_CONTENT_TYPES ? '' : value)}
        >
          <SelectTrigger id="filterContentType">
            <SelectValue placeholder={t('All Content Types')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CONTENT_TYPES}>{t('All Content Types')}</SelectItem>
            {contentTypes.map((type: string) => (
              <SelectItem key={type} value={type}>
                {t(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      </Field>

      <Field>
        <FieldLabel htmlFor="filterTags" className="sr-only">
          {t('Filter by Tags')}
        </FieldLabel>
        <Select
          inputId="filterTags"
          isMulti
          placeholder={t('Filter by Tags')}
          options={tagOptions}
          value={(tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
          onChange={(opts) => setTagFilter((opts || []).map((o: any) => o.value))}
          styles={selectStyles}
          menuPortalTarget={document.body}
        />
      </Field>

      {onReset ? (
        <div className="col-span-2 flex justify-end">
          <Button
            size="dashboard"
            variant="secondary"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            {t('Reset filters')}
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div ref={rootRef as any} aria-label={t('Filter Interventions')}>
      {/* top row */}
      <div className="flex items-center gap-2">
        <Field className="grow">
          <FieldLabel htmlFor="searchInput" className="sr-only">
            {t('Search Interventions')}
          </FieldLabel>
          <Input
            id="searchInput"
            type="text"
            placeholder={t('Search Interventions')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Field>

        {/* narrow: dropdown toggle */}
        {isNarrow ? (
          <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button size="dashboard" variant="secondary">
                <FaFilter />
                {t('Filters')}
                {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="p-3 w-[min(520px,86vw)]">
              {FiltersGrid}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {/* meta row */}
      {typeof resultCount === 'number' || loading || (!isNarrow && onReset) ? (
        <div className="flex items-center justify-between gap-2 mt-2.5">
          <div className="text-muted small">
            {loading
              ? `${t('Loading')}...`
              : typeof resultCount === 'number'
                ? `${resultCount} ${t('items')}`
                : null}
          </div>

          {/* non-narrow: show reset here (single place) */}
          {!isNarrow && onReset ? (
            <Button size="dashboard" variant="secondary" onClick={onReset}>
              {t('Reset filters')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* non-narrow: always visible grid */}
      {!isNarrow ? <div className="mt-3">{FiltersGrid}</div> : null}
    </div>
  );
};

export default FilterBar;
