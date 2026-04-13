// components/TherapistInterventionPage/FilterBar.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Dropdown, Form } from 'react-bootstrap';
import Select from 'react-select';
import interventionsConfig from '../../config/interventions.json';
import { FaFilter } from 'react-icons/fa';

interface Props {
  searchTerm: string;
  setSearchTerm: (val: string) => void;

  patientTypeFilter: string;
  setPatientTypeFilter: (val: string) => void;

  diagnosisFilter?: string[];
  setDiagnosisFilter?: (val: string[]) => void;

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
  patientTypeFilter,
  setPatientTypeFilter,
  diagnosisFilter,
  setDiagnosisFilter,
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

  const patientTypes = useMemo(
    () => (Array.isArray(tx.primary_diagnoses) ? tx.primary_diagnoses : []),
    [tx]
  );
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
    ...(Array.isArray(tx.original_languages) ? tx.original_languages : []),
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

  const activeFiltersCount =
    (patientTypeFilter ? 1 : 0) +
    (diagnosisFilter?.length ? 1 : 0) +
    (contentTypeFilter ? 1 : 0) +
    (tagFilter?.length ? 1 : 0);

  const FiltersGrid = (
    <div
      className="filterbar-grid"
      // ✅ prevent bubbling to any parent click handlers (common in cards/lists)
      onClick={(e) => e.stopPropagation()}
    >
      <Form.Group controlId="filterPatientType">
        <Form.Label visuallyHidden>{t('Filter by Patient Type')}</Form.Label>
        <Form.Select
          value={patientTypeFilter}
          onChange={(e) => {
            setPatientTypeFilter(e.target.value);
            setDiagnosisFilter([]);
          }}
        >
          <option value="">{t('All Patient Types')}</option>
          {patientTypes.map((type: string) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {setDiagnosisFilter && (
        <Form.Group controlId="filterDiagnosis">
          <Form.Label visuallyHidden>{t('Filter by Diagnosis')}</Form.Label>
          <Select
            isMulti
            placeholder={t('Filter by Diagnosis')}
            options={diagnosisOptions.map((d: string) => ({ value: d, label: t(d) }))}
            value={(diagnosisFilter || []).map((d) => ({ value: d, label: t(d) }))}
            onChange={(opts) => setDiagnosisFilter((opts || []).map((o: any) => o.value))}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </Form.Group>
      )}

      <Form.Group controlId="filterContentType">
        <Form.Label visuallyHidden>{t('Filter by Content Type')}</Form.Label>
        <Form.Select
          value={contentTypeFilter}
          onChange={(e) => setContentTypeFilter(e.target.value)}
        >
          <option value="">{t('All Content Types')}</option>
          {contentTypes.map((type: string) => (
            <option key={type} value={type}>
              {t(type)}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      <Form.Group controlId="filterTags">
        <Form.Label visuallyHidden>{t('Filter by Tags')}</Form.Label>
        <Select
          isMulti
          placeholder={t('Filter by Tags')}
          options={tagOptions}
          value={(tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
          onChange={(opts) => setTagFilter((opts || []).map((o: any) => o.value))}
          styles={selectStyles}
          menuPortalTarget={document.body}
        />
      </Form.Group>

      {onReset ? (
        <div className="d-flex justify-content-end">
          <Button
            size="sm"
            variant="outline-secondary"
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
    <Card
      ref={rootRef as any}
      className="p-3 shadow-sm w-100"
      aria-label={t('Filter Interventions')}
    >
      {/* top row */}
      <div className="filterbar-top">
        <Form.Group className="flex-grow-1" controlId="searchInput">
          <Form.Label visuallyHidden>{t('Search Interventions')}</Form.Label>
          <Form.Control
            type="text"
            placeholder={t('Search Interventions')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </Form.Group>

        {/* narrow: dropdown toggle */}
        {isNarrow ? (
          <Dropdown
            show={open}
            onToggle={(next, meta) => {
              // ignore rootClose if click happens inside menu
              // (Dropdown already handles this well; this is extra safety)
              setOpen(next);
            }}
            align="end"
          >
            <Dropdown.Toggle
              as={Button}
              variant="outline-secondary"
              className="filterbar-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
            >
              <FaFilter className="me-2" />
              {t('Filters')}
              {activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}
            </Dropdown.Toggle>

            <Dropdown.Menu
              className="filterbar-menu"
              onClick={(e) => e.stopPropagation()} // ✅ keep it open while interacting
            >
              {FiltersGrid}
            </Dropdown.Menu>
          </Dropdown>
        ) : null}
      </div>

      {/* meta row */}
      {typeof resultCount === 'number' || loading ? (
        <div className="filterbar-meta">
          <div className="text-muted small">
            {loading
              ? `${t('Loading')}...`
              : typeof resultCount === 'number'
                ? `${resultCount} ${t('items')}`
                : null}
          </div>

          {/* non-narrow: show reset here (single place) */}
          {!isNarrow && onReset ? (
            <Button size="sm" variant="outline-secondary" onClick={onReset}>
              {t('Reset filters')}
            </Button>
          ) : null}
        </div>
      ) : !isNarrow && onReset ? (
        <div className="filterbar-meta">
          <div />
          <Button size="sm" variant="outline-secondary" onClick={onReset}>
            {t('Reset filters')}
          </Button>
        </div>
      ) : null}

      {/* non-narrow: always visible grid */}
      {!isNarrow ? <div className="mt-3">{FiltersGrid}</div> : null}

      <style>{`
        .filterbar-top {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .filterbar-toggle { white-space: nowrap; }
        .filterbar-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          gap: 12px;
        }
        .filterbar-menu {
          padding: 12px;
          width: min(520px, 86vw);
        }
        .filterbar-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: 1fr;
        }
        @media (min-width: 520px) {
          .filterbar-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </Card>
  );
};

export default FilterBar;
