import React, { useMemo } from 'react';
import Select from 'react-select';
import { FaUndo } from 'react-icons/fa';

import interventionsConfig from '../../config/interventions.json';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type LibraryFiltersState = {
  searchTerm: string;
  diagnosisFilter: string[];
  languageFilter: string[];
  contentTypeFilter: string;

  // aims is its own field (not part of tags)
  aimsFilter: string[];

  // tags = everything except aims
  tagFilter: string[];
};

type Props = {
  t: any;
  filters: LibraryFiltersState;
  onChange: (next: LibraryFiltersState) => void;
  onReset: () => void;
};

const uniq = (arr: any[]) => Array.from(new Set((arr || []).map((x) => String(x)).filter(Boolean)));

const ALL_CONTENT_TYPES = '__all__';

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

  // Build tag options from taxonomy EXCLUDING aims and languages
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
      <CardContent className="p-3">
        <div className="mb-3">
          <Input
            id="searchInput"
            type="text"
            placeholder={t('Search Interventions')}
            value={filters.searchTerm}
            onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
          />
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
            <UiSelect
              value={filters.contentTypeFilter || ALL_CONTENT_TYPES}
              onValueChange={(value) =>
                onChange({
                  ...filters,
                  contentTypeFilter: value === ALL_CONTENT_TYPES ? '' : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder={t('Filter by Content Type')} />
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
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
          <Button size="dashboard" variant="secondary" onClick={onReset}>
            <FaUndo /> {t('Reset filters')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LibraryFiltersCard;
