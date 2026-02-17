// src/pages/patient-library/InterventionFiltersCard.tsx
import React, { useMemo } from 'react';
import { Button, Card, Col, Form, Row } from 'react-bootstrap';
import Select from 'react-select';
import { useTranslation } from 'react-i18next';

import interventionsConfig from '../../config/interventions.json';
import type { InterventionTypeTh } from '../../types';

type Option = { value: string; label: string };

type Props = {
  // optional: pass the currently loaded items to enhance filter lists (recommended)
  items?: InterventionTypeTh[];

  searchTerm: string;
  onSearchTerm: (v: string) => void;

  contentType: string;
  onContentType: (v: string) => void;

  aimsFilter: string[];
  onAimsFilter: (v: string[]) => void;

  tagFilter: string[];
  onTagFilter: (v: string[]) => void;

  loading: boolean;
  resultCount: number;

  onReset: () => void;
};

const uniq = (arr: any[]) =>
  Array.from(
    new Set(
      (arr || [])
        .map((x) => String(x))
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );

const InterventionFiltersCard: React.FC<Props> = ({
  items = [],
  searchTerm,
  onSearchTerm,
  contentType,
  onContentType,
  aimsFilter,
  onAimsFilter,
  tagFilter,
  onTagFilter,
  loading,
  resultCount,
  onReset,
}) => {
  const { t } = useTranslation();

  const tx = (interventionsConfig as any)?.interventionsTaxonomy || {};

  // --- taxonomy sources (preferred) ---
  const taxonomyAims = useMemo(() => uniq(tx.aims), [tx]);
  const taxonomyContentTypes = useMemo(() => uniq(tx.content_types), [tx]);

  const taxonomyTags = useMemo(() => {
    const buckets = [
      ...(tx.topics || []),
      ...(tx.lc9 || []),
      ...(tx.cognitive_levels || []),
      ...(tx.physical_levels || []),
      ...(tx.timing || []),
      ...(tx.duration_buckets || []),
      ...(tx.sex_specific || []),
      ...(tx.where || []),
      ...(tx.setting || []),
      ...(tx.primary_diagnoses || []),
      ...(tx.input_from || []),
      ...(tx.original_languages || []),
    ];
    return uniq(uniq(buckets).filter((x) => !taxonomyAims.includes(x)));
  }, [tx, taxonomyAims]);

  // --- runtime sources (fallback/augment): derive from loaded items ---
  const runtimeAims = useMemo(() => {
    const all = items.flatMap((it: any) => (Array.isArray(it?.aims) ? it.aims : []));
    return uniq(all);
  }, [items]);

  const runtimeTags = useMemo(() => {
    const all = items.flatMap((it: any) => (Array.isArray(it?.tags) ? it.tags : []));
    // make sure aims are excluded from tags
    return uniq(all).filter((x) => !taxonomyAims.includes(x));
  }, [items, taxonomyAims]);

  const runtimeContentTypes = useMemo(() => {
    const all = items.map((it: any) => it?.content_type ?? it?.contentType ?? '');
    return uniq(all);
  }, [items]);

  // merge taxonomy + runtime so filters don’t become empty if taxonomy misses something
  const aims = useMemo(() => uniq([...taxonomyAims, ...runtimeAims]), [taxonomyAims, runtimeAims]);
  const contentTypes = useMemo(
    () => uniq([...taxonomyContentTypes, ...runtimeContentTypes]),
    [taxonomyContentTypes, runtimeContentTypes]
  );
  const tags = useMemo(
    () => uniq([...taxonomyTags, ...runtimeTags]).filter((x) => !aims.includes(x)),
    [taxonomyTags, runtimeTags, aims]
  );

  const aimsOptions: Option[] = useMemo(
    () => aims.map((a) => ({ value: a, label: t(a) })),
    [aims, t]
  );
  const tagOptions: Option[] = useMemo(
    () => tags.map((tag) => ({ value: tag, label: t(tag) })),
    [tags, t]
  );

  return (
    <Card className="shadow-sm border-0">
      <Card.Body className="p-3 p-sm-4">
        <Row className="g-3">
          <Col xs={12}>
            <Form.Group controlId="searchInput">
              <Form.Control
                type="text"
                placeholder={t('Search Interventions')}
                value={searchTerm}
                onChange={(e) => onSearchTerm(e.target.value)}
              />
            </Form.Group>
          </Col>

          <Col xs={12}>
            <Form.Select value={contentType} onChange={(e) => onContentType(e.target.value)}>
              <option value="">{t('Filter by Content Type')}</option>
              {contentTypes.map((type: string) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </Col>

          {/* Aims */}
          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={aimsOptions}
              value={(aimsFilter || []).map((a) => ({ value: a, label: t(a) }))}
              onChange={(opts) => onAimsFilter((opts || []).map((opt) => (opt as any).value))}
              placeholder={t('Filter by Aims')}
              classNamePrefix="rs"
            />
          </Col>

          {/* Tags */}
          <Col xs={12} lg={6}>
            <Select
              isMulti
              options={tagOptions}
              value={(tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
              onChange={(opts) => onTagFilter((opts || []).map((opt) => (opt as any).value))}
              placeholder={t('Filter by Tags')}
              classNamePrefix="rs"
            />
          </Col>

          <Col xs={12}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <Button variant="outline-secondary" size="sm" onClick={onReset}>
                {t('Reset filters')}
              </Button>

              <span className="text-muted small">
                {loading ? `${t('Loading')}...` : `${resultCount} ${t('items')}`}
              </span>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

export default InterventionFiltersCard;
