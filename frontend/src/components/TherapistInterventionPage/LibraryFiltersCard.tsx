import React, { useMemo } from 'react';
import { Form, Button } from 'react-bootstrap';
import Select from 'react-select';
import { FaUndo } from 'react-icons/fa';

// ✅ NEW taxonomy config
import interventionsConfig from '../../config/interventions.json';
import { Card, CardContent } from '@/components/ui/card';

export type LibraryFiltersState = {
  searchTerm: string;
  diagnosisFilter: string[];
  languageFilter: string[];
  contentTypeFilter: string;

  // ✅ aims is its own field (not part of tags)
  aimsFilter: string[];

  // ✅ tags = everything except aims
  tagFilter: string[];
};

type Props = {
  t: any;
  filters: LibraryFiltersState;
  onChange: (next: LibraryFiltersState) => void;
  onReset: () => void;
};

const uniq = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));

const LibraryFiltersCard: React.FC<Props> = ({ t, filters, onChange, onReset }) => {
  const tx = (interventionsConfig as any)?.interventionsTaxonomy || {};

  const aims = useMemo(() => uniq(tx.aims), [tx]);
  const contentTypes = useMemo(() => uniq(tx.content_types), [tx]);
  const diagnosisOptions = useMemo(
    () => uniq(tx.primary_diagnoses || []).map((d: string) => ({ value: d, label: t(d) })),
    [tx, t]
  );
  const languageOptions = useMemo(
    () => uniq(tx.languages || []).map((l: string) => ({ value: l, label: l.toUpperCase() })),
    [tx]
  );

  // ✅ Build tag options from taxonomy EXCLUDING aims and languages
  const tagOptions = useMemo(() => {
    const buckets = [
      ...(tx.topics || []),
      ...(tx.cognitive_levels || []),
      ...(tx.physical_levels || []),
      ...(tx.duration_buckets || []),
      ...(tx.sex_specific || []),
      ...(tx.where || []),
      ...(tx.setting || []),
      ...(tx.input_from || []),
    ];

    return uniq(buckets)
      .filter((x) => !aims.includes(x))
      .map((tag) => ({ value: tag, label: t(tag) }));
  }, [tx, aims, t]);

  const aimsOptions = useMemo(() => aims.map((a) => ({ value: a, label: t(a) })), [aims, t]);

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="mb-3">
          <Form.Group controlId="searchInput">
            <Form.Control
              type="text"
              placeholder={t('Search Interventions')}
              value={filters.searchTerm}
              onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
            />
          </Form.Group>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div>
            <Select
              isMulti
              options={diagnosisOptions}
              value={(filters.diagnosisFilter || []).map((d) => ({ value: d, label: t(d) }))}
              onChange={(opts) =>
                onChange({ ...filters, diagnosisFilter: (opts || []).map((o: any) => o.value) })
              }
              placeholder={t('Filter by Primary Diagnosis')}
            />
          </div>

          <div>
            <Select
              isMulti
              options={languageOptions}
              value={(filters.languageFilter || []).map((l) => ({
                value: l,
                label: l.toUpperCase(),
              }))}
              onChange={(opts) =>
                onChange({ ...filters, languageFilter: (opts || []).map((o: any) => o.value) })
              }
              placeholder={t('Filter by Language')}
            />
          </div>

          <div>
            <Form.Select
              value={filters.contentTypeFilter}
              onChange={(e) => onChange({ ...filters, contentTypeFilter: e.target.value })}
            >
              <option value="">{t('Filter by Content Type')}</option>
              {contentTypes.map((type: string) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* ✅ Aims */}
          <div>
            <Select
              isMulti
              options={aimsOptions}
              value={(filters.aimsFilter || []).map((a) => ({ value: a, label: t(a) }))}
              onChange={(opts) =>
                onChange({ ...filters, aimsFilter: (opts || []).map((o: any) => o.value) })
              }
              placeholder={t('Filter by Aims')}
            />
          </div>

          {/* ✅ Tags (everything except aims) */}
          <div>
            <Select
              isMulti
              options={tagOptions}
              value={(filters.tagFilter || []).map((tag) => ({ value: tag, label: t(tag) }))}
              onChange={(opts) =>
                onChange({ ...filters, tagFilter: (opts || []).map((o: any) => o.value) })
              }
              placeholder={t('Filter by Tags')}
            />
          </div>
        </div>

        <div>
          <Button variant="outline-secondary" size="sm" onClick={onReset}>
            <FaUndo className="me-2" /> {t('Reset filters')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LibraryFiltersCard;
