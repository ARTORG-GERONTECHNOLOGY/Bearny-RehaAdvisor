// src/components/TherapistInterventionPage/TemplatesLayout.tsx
import React from 'react';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FaPlus, FaMinus, FaEdit } from 'react-icons/fa';
import { getTagColor } from '@/utils/interventions';
import FilterBar from '@/components/TherapistInterventionPage/FilterBar';

import type { TemplateItem } from '@/types/templates';
import type { InterventionTypeTh } from '@/types';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ButtonGroup } from '@/components/ui/button-group';
import { Button } from '@/components/ui/button';

export type TemplatesFiltersState = {
  tSearchTerm: string;
  tDiagnosisFilter: string[];
  tLanguageFilter: string[];
  tContentTypeFilter: string;
  tTagFilter: string[];
};

type Props = {
  t: (key: string) => string;

  templateItems: TemplateItem[];
  tLoading: boolean;

  translatedTitles: Record<string, { title: string; lang: string | null }>;
  getSegments: (it: TemplateItem) => any[];
  segmentSummary: (seg: any, it: TemplateItem) => string;

  onTemplateItemClick: (it: TemplateItem) => void;
  onModifyTemplate: (it: TemplateItem) => void;
  onRemoveTemplateItem: (diagnosis: string, interventionId: string) => void;

  browseAllItems: InterventionTypeTh[];
  findTemplateFor: (intId: string) => TemplateItem | undefined;
  onOpenAssign: (id: string, title?: string, mode?: 'create' | 'modify') => void;
  onBrowseItemClick: (intervention: InterventionTypeTh) => void;

  filters: TemplatesFiltersState;
  onFilters: (next: TemplatesFiltersState) => void;
  onResetFilters: () => void;

  timeline: React.ReactNode;
  tagColors: Record<string, string>;
};

const TemplatesLayout: React.FC<Props> = ({
  t,
  templateItems,
  tLoading,
  translatedTitles,
  getSegments,
  segmentSummary,
  onTemplateItemClick,
  onModifyTemplate,
  onRemoveTemplateItem,
  browseAllItems,
  findTemplateFor,
  onOpenAssign,
  onBrowseItemClick,
  filters,
  onFilters,
  onResetFilters,
  timeline,
  tagColors,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
      <div className="md:col-span-4 flex flex-col gap-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('In Template')}</CardTitle>
            <CardAction>
              <Badge variant="dashboard">{templateItems.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 max-h-96 overflow-auto">
            {tLoading && <div className="text-zinc-500">{t('Loading...')}</div>}
            {!tLoading && templateItems.length === 0 && (
              <div className="text-zinc-500">{t('No template items')}</div>
            )}
            {templateItems.map((it, idx) => (
              <Card
                key={`${it.intervention._id}-${it.diagnosis}-${idx}`}
                className="flex justify-between align-items-start p-3 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onTemplateItemClick(it)}
                title={t('Click to view details')}
              >
                <div>
                  <div className="fw-semibold text-sm">
                    {translatedTitles[it.intervention._id]?.title || it.intervention.title}
                    {translatedTitles[it.intervention._id]?.lang && (
                      <span className="text-muted ms-2 text-xs">
                        ({t('Translated from')}: {translatedTitles[it.intervention._id]?.lang})
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted">
                    {t('For')}: {it.diagnosis}
                  </div>

                  <div className="text-xs text-muted mt-1">
                    {getSegments(it).map((seg, i) => (
                      <div key={i}>{segmentSummary(seg, it)}</div>
                    ))}
                  </div>
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <ButtonGroup orientation="vertical">
                    <OverlayTrigger placement="left" overlay={<Tooltip>{t('Modify')}</Tooltip>}>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => onModifyTemplate(it)}
                        className="px-2"
                      >
                        <FaEdit />
                      </Button>
                    </OverlayTrigger>

                    <OverlayTrigger placement="left" overlay={<Tooltip>{t('Remove')}</Tooltip>}>
                      <Button
                        size="dashboard"
                        variant="secondary"
                        onClick={() => onRemoveTemplateItem(it.diagnosis, it.intervention._id)}
                        className="px-2"
                      >
                        <FaMinus className="text-nok" />
                      </Button>
                    </OverlayTrigger>
                  </ButtonGroup>
                </div>
              </Card>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t('Browse All')}</CardTitle>
            <CardAction>
              <Badge variant="dashboard">{browseAllItems.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FilterBar
              searchTerm={filters.tSearchTerm}
              setSearchTerm={(v) => onFilters({ ...filters, tSearchTerm: v })}
              diagnosisFilter={filters.tDiagnosisFilter}
              setDiagnosisFilter={(v) => onFilters({ ...filters, tDiagnosisFilter: v })}
              languageFilter={filters.tLanguageFilter}
              setLanguageFilter={(v) => onFilters({ ...filters, tLanguageFilter: v })}
              contentTypeFilter={filters.tContentTypeFilter}
              setContentTypeFilter={(v) => onFilters({ ...filters, tContentTypeFilter: v })}
              tagFilter={filters.tTagFilter}
              setTagFilter={(v) => onFilters({ ...filters, tTagFilter: v })}
              t={t}
              onReset={onResetFilters}
            />

            <div className="mt-3 flex flex-col gap-2 max-h-[420px] overflow-y-auto">
              {browseAllItems.length === 0 && (
                <div className="text-muted px-2">{t('No interventions match your filters.')}</div>
              )}

              {browseAllItems.map((intervention) => {
                const displayTitle =
                  translatedTitles[intervention._id]?.title ?? intervention.title;
                const entry = findTemplateFor(intervention._id);
                const inTemplate = !!entry;

                return (
                  <Card
                    key={intervention._id}
                    className="flex justify-between align-items-start p-3 cursor-pointer hover:shadow-md transition-shadow"
                    title={t('Click to view details')}
                    onClick={() => onBrowseItemClick(intervention)}
                  >
                    <div>
                      <div className="fw-semibold text-sm">{displayTitle}</div>

                      {(intervention.tags || []).length > 0 && (
                        <div className="mt-2 d-flex flex-wrap gap-1" aria-label={t('Tags')}>
                          {(intervention.tags || []).map((tag) => (
                            <Badge
                              key={tag}
                              className="px-2 py-1"
                              style={{
                                backgroundColor: getTagColor(tagColors, tag) || 'gray',
                                color: '#fff',
                              }}
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
                            size="dashboard"
                            variant="secondary"
                            onClick={() => onOpenAssign(intervention._id, displayTitle, 'create')}
                            className="px-2"
                          >
                            <FaPlus className="text-ok" />
                          </Button>
                        </OverlayTrigger>
                      ) : (
                        <ButtonGroup orientation="vertical">
                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Modify')}</Tooltip>}
                          >
                            <Button
                              size="dashboard"
                              variant="secondary"
                              onClick={() =>
                                onOpenAssign(entry!.intervention._id, displayTitle, 'modify')
                              }
                              className="px-2"
                            >
                              <FaEdit />
                            </Button>
                          </OverlayTrigger>

                          <OverlayTrigger
                            placement="left"
                            overlay={<Tooltip>{t('Remove')}</Tooltip>}
                          >
                            <Button
                              size="dashboard"
                              variant="secondary"
                              onClick={() =>
                                onRemoveTemplateItem(entry!.diagnosis, intervention._id)
                              }
                              className="px-2"
                            >
                              <FaMinus className="text-nok" />
                            </Button>
                          </OverlayTrigger>
                        </ButtonGroup>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="md:col-span-8">
        <Card className="h-100">
          <CardContent className="p-4">
            <div className="min-vh-50 overflow-auto">{timeline}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TemplatesLayout;
