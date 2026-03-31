// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';

import authStore from '@/stores/authStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

import PatientLibraryFilterSheet from '@/components/PatientLibrary/PatientLibraryFilterSheet';
import PatientLibraryInterventionCard from '@/components/PatientLibrary/PatientLibraryInterventionCard';
import PatientLibrarySearchPanel from '@/components/PatientLibrary/PatientLibrarySearchPanel';
import { filterInterventions } from '@/utils/filterUtils';
import { translateText } from '@/utils/translate';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';
import AudioIcon from '@/assets/icons/interventions/audio.svg?react';
import TextIcon from '@/assets/icons/interventions/text.svg?react';
import VideoIcon from '@/assets/icons/interventions/video.svg?react';
import WebsiteIcon from '@/assets/icons/interventions/website.svg?react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import ArrowRightIcon from '@/assets/icons/arrow-right-fill.svg?react';
import Section from '@/components/Section';

type TitleMap = Record<string, { title: string; lang: string | null }>;

type InterventionCardItem = {
  _id?: string | number;
  id?: string | number;
  title?: string;
  duration?: string | number;
  content_type?: string;
  aims?: string[];
  intervention_title?: string;
  intervention_id?: string;
};

type OptionItem = {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }> | null;
};

const getTypeIcon = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase();

  if (normalized.includes('exercise')) return ExerciseIcon;
  if (normalized.includes('education')) return EducationIcon;
  if (normalized.includes('instruction')) return EducationIcon;

  return null;
};

const getContentTypeIcon = (value: string) => {
  const normalized = value.trim().toLocaleLowerCase();

  if (normalized.includes('audio')) return AudioIcon;
  if (normalized.includes('text')) return TextIcon;
  if (normalized.includes('video')) return VideoIcon;
  if (normalized.includes('image')) return VideoIcon;
  if (normalized.includes('website')) return WebsiteIcon;
  if (normalized.includes('app')) return WebsiteIcon;

  return null;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const durationBuckets = [5, 20, 35, 50, 60];
const durationLabels = ['5min', '20min', '35min', '50min', '1h+'];

const buildUniqueOptions = <T,>(
  sourceItems: T[],
  getValue: (item: T) => unknown,
  getIcon: (value: string) => React.ComponentType<{ className?: string }> | null
): OptionItem[] => {
  const byNormalized = new Map<string, string>();

  sourceItems
    .map((item) => getValue(item))
    .flat()
    .filter(Boolean)
    .forEach((raw: unknown) => {
      const value = String(raw).trim();
      const normalized = value.toLocaleLowerCase();

      if (!byNormalized.has(normalized)) {
        byNormalized.set(normalized, value);
      }
    });

  return Array.from(byNormalized.values()).map((value) => ({
    value,
    label: value,
    Icon: getIcon(value),
  }));
};

const hasAimKeyword = (item: InterventionCardItem, keyword: string) =>
  (Array.isArray(item.aims) ? item.aims : []).some((aim: string) =>
    String(aim).toLocaleLowerCase().includes(keyword)
  );

const getRawTitle = (item: InterventionCardItem) =>
  String(item?.title || item?.intervention_title || '').trim();

const getTranslatedTitle = (item: InterventionCardItem, translatedTitles: TitleMap) => {
  const key = item._id || item.id;
  if (!key) return getRawTitle(item) || '-';

  const translated = translatedTitles[String(key)]?.title;
  if (translated && translated.trim()) return translated.trim();

  return getRawTitle(item) || '-';
};

const PatientInterventionsLibrary: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const openDetails = useCallback(
    (item: { _id?: string | number; id?: string | number; intervention_id?: string | number }) => {
      const interventionId = item.intervention_id || item._id || item.id;
      if (!interventionId) return;
      navigate(`/patient-intervention/${String(interventionId)}`);
    },
    [navigate]
  );

  // ─────────────────────────── auth gate ───────────────────────────
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await authStore.checkAuthentication();
      } finally {
        if (mounted) setAuthChecked(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // ─────────────────────────── filters ───────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string[]>([]);
  const [aimsFilter, setAimsFilter] = useState<string[]>([]);
  const [durationFilterIndices, setDurationFilterIndices] = useState<[number, number]>([0, 4]);

  const resetAllFilters = useCallback(() => {
    setSearchTerm('');
    setContentTypeFilter([]);
    setAimsFilter([]);
    setDurationFilterIndices([0, 4]);
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchTerm('');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [searchTerm]);

  // ─────────────────────────── fetch list via store ───────────────────────────
  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
      return;
    }

    const lang = (i18n.language || 'en').slice(0, 2);
    patientInterventionsLibraryStore.fetchAll({ mode: 'patient', lang });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate, i18n.language]);

  const sourceItems = patientInterventionsLibraryStore.visibleItemsForPatient;
  const storeError = patientInterventionsLibraryStore.error;
  const storeLoading = patientInterventionsLibraryStore.loading;

  // ─────────────────────────── (optional) translate titles cache ───────────────────────────
  // This is purely UI sugar for lists that don’t already come translated.
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sourceItems.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      // Only translate if needed (cheap heuristic)
      const pairs = await Promise.all(
        (sourceItems as InterventionCardItem[]).map(async (rec) => {
          const id = rec._id || rec.id;
          const rawTitle = String(rec.title || rec.intervention_title || '').trim();
          if (!id || !rawTitle)
            return [id || Math.random().toString(), { title: rawTitle, lang: null }] as const;

          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rawTitle);
            return [
              id,
              {
                title: translatedText || rawTitle,
                lang:
                  translatedText && translatedText !== rawTitle
                    ? detectedSourceLanguage || null
                    : null,
              },
            ] as const;
          } catch {
            return [id, { title: rawTitle, lang: null }] as const;
          }
        })
      );

      if (!cancelled) setTranslatedTitles(Object.fromEntries(pairs));
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceItems, i18n.language]);

  // ─────────────────────────── filtered list ───────────────────────────
  const filteredItems = useMemo(() => {
    // NOTE: your filterInterventions already supports tags/content/search.
    // Here we add aimsFilter: assumes items have .aims array in your new model.
    const base = filterInterventions(sourceItems as any, translatedTitles, {
      patientTypeFilter: '',
      contentTypeFilter: '',
      tagFilter: [],
      benefitForFilter: [],
      searchTerm,
    });

    const withContentType =
      contentTypeFilter.length > 0
        ? base.filter((it: any) =>
            contentTypeFilter.includes(String(it?.content_type || '').trim())
          )
        : base;

    const withAims =
      aimsFilter.length > 0
        ? withContentType.filter((it: any) => {
            const aims: string[] = Array.isArray(it?.aims) ? it.aims : [];
            return aimsFilter.every((a) => aims.includes(a));
          })
        : withContentType;

    const withDuration = withAims.filter((it: any) => {
      const duration = Number(it?.duration);
      if (isNaN(duration)) return false;

      const minBucket = durationBuckets[durationFilterIndices[0]];
      const maxBucket = durationBuckets[durationFilterIndices[1]];
      const maxBucketValue = durationFilterIndices[1] === 4 ? Infinity : maxBucket;
      return duration >= minBucket && duration <= maxBucketValue;
    });

    return withDuration;
  }, [
    sourceItems,
    contentTypeFilter,
    aimsFilter,
    searchTerm,
    translatedTitles,
    durationFilterIndices,
    durationBuckets,
  ]);

  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);

  const typeOptions = useMemo(() => {
    return buildUniqueOptions(
      sourceItems as InterventionCardItem[],
      (item) => item.aims,
      getTypeIcon
    );
  }, [sourceItems]);

  const contentOptions = useMemo(() => {
    return buildUniqueOptions(
      sourceItems as InterventionCardItem[],
      (item) => item.content_type,
      getContentTypeIcon
    );
  }, [sourceItems]);

  const exerciseItems = useMemo(
    () => filteredItems.filter((item: InterventionCardItem) => hasAimKeyword(item, 'exercise')),
    [filteredItems]
  );

  const educationItems = useMemo(
    () => filteredItems.filter((item: InterventionCardItem) => hasAimKeyword(item, 'education')),
    [filteredItems]
  );

  const instructionItems = useMemo(
    () => filteredItems.filter((item: InterventionCardItem) => hasAimKeyword(item, 'instruction')),
    [filteredItems]
  );

  const [showTypeSheet, setShowTypeSheet] = useState<boolean>(false);
  const [activeTypeSection, setActiveTypeSection] = useState<
    'exercise' | 'education' | 'instruction'
  >('exercise');

  const typeSections = useMemo(
    () => [
      {
        key: 'exercise' as const,
        title: t('Exercise'),
        Icon: ExerciseIcon,
        items: exerciseItems,
      },
      {
        key: 'education' as const,
        title: t('Education'),
        Icon: EducationIcon,
        items: educationItems,
      },
      {
        key: 'instruction' as const,
        title: t('Instruction'),
        Icon: EducationIcon,
        items: instructionItems,
      },
    ],
    [t, exerciseItems, educationItems, instructionItems]
  );

  const visibleTypeSections = useMemo(
    () => typeSections.filter((section) => section.items.length > 0),
    [typeSections]
  );

  const activeTypeData =
    visibleTypeSections.find((section) => section.key === activeTypeSection) ||
    visibleTypeSections[0];

  const normalizedSearchTerm = searchTerm.trim();
  const isSearchOpen = Boolean(normalizedSearchTerm);

  const searchResults = useMemo(() => {
    if (!normalizedSearchTerm) return [];

    const loweredSearch = normalizedSearchTerm.toLocaleLowerCase();
    return (sourceItems as InterventionCardItem[]).filter((item) => {
      const originalTitle = getRawTitle(item).toLocaleLowerCase();
      const translatedTitle = getTranslatedTitle(item, translatedTitles).toLocaleLowerCase();
      return originalTitle.includes(loweredSearch) || translatedTitle.includes(loweredSearch);
    });
  }, [sourceItems, normalizedSearchTerm, translatedTitles]);

  const getSearchResultIcon = useCallback(
    (item: InterventionCardItem) =>
      getTypeIcon(Array.isArray(item?.aims) ? String(item.aims[0] || '') : '') || EducationIcon,
    []
  );

  const renderHighlightedTitle = useCallback(
    (title: string) => {
      if (!normalizedSearchTerm) {
        return <span className="text-zinc-400">{title}</span>;
      }

      const pattern = new RegExp(`(${escapeRegExp(normalizedSearchTerm)})`, 'ig');
      const parts = title.split(pattern);

      return parts.map((part, index) => {
        const isMatch = part.toLocaleLowerCase() === normalizedSearchTerm.toLocaleLowerCase();
        return (
          <span key={`${part}-${index}`} className={isMatch ? 'text-zinc-800' : 'text-zinc-400'}>
            {part}
          </span>
        );
      });
    },
    [normalizedSearchTerm]
  );

  return (
    <Layout>
      <h1 className="text-2xl font-bold">{t('Library')}</h1>

      <PatientLibrarySearchPanel
        searchTerm={searchTerm}
        isSearchOpen={isSearchOpen}
        searchResults={searchResults}
        onSearchTermChange={setSearchTerm}
        onCloseSearch={() => setSearchTerm('')}
        onOpenFilter={() => setShowFilterSheet(true)}
        onOpenDetails={openDetails}
        renderHighlightedTitle={renderHighlightedTitle}
        getDisplayTitle={(item) => getTranslatedTitle(item, translatedTitles)}
        getResultIcon={getSearchResultIcon}
      />

      {/* Error */}
      {storeError && (
        <ErrorAlert
          message={storeError}
          onClose={() => patientInterventionsLibraryStore.clearError()}
          className="mt-6"
        />
      )}

      {/* Filters */}
      <PatientLibraryFilterSheet
        open={showFilterSheet}
        onOpenChange={(isOpen) => !isOpen && setShowFilterSheet(false)}
        typeOptions={typeOptions}
        contentOptions={contentOptions}
        aimsFilter={aimsFilter}
        setAimsFilter={setAimsFilter}
        contentTypeFilter={contentTypeFilter}
        setContentTypeFilter={setContentTypeFilter}
        durationFilterIndices={durationFilterIndices}
        setDurationFilterIndices={setDurationFilterIndices}
        durationLabels={durationLabels}
        onResetFilters={resetAllFilters}
      />

      {/* Lists by type */}
      <div className="mt-16 flex flex-col gap-2">
        {storeLoading && (
          <>
            <Skeleton className="w-full h-80 rounded-[40px]" />
            <Skeleton className="w-full h-80 rounded-[40px]" />
            <Skeleton className="w-full h-80 rounded-[40px]" />
          </>
        )}

        {!storeLoading && visibleTypeSections.length === 0 && (
          <div className="flex flex-col gap-2 items-center justify-center py-12 px-4">
            <div className="text-lg font-medium text-zinc-600 text-center">
              {t('No entries found.')}
            </div>
            <Button
              onClick={resetAllFilters}
              className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-sm font-medium text-zinc-50"
            >
              {t('Reset filters')}
            </Button>
          </div>
        )}

        {!storeLoading &&
          visibleTypeSections.map((section) => (
            <Section
              key={section.key}
              role="button"
              onClick={() => {
                setActiveTypeSection(section.key);
                setShowTypeSheet(true);
              }}
            >
              <div className="p-2 pl-4 flex items-center justify-between">
                <div className="flex items-center gap-3 font-medium text-lg text-zinc-500">
                  <span>{section.title}</span>
                </div>
                <div className="flex gap-1">
                  <Badge className="px-3 py-1 rounded-full border-none bg-zinc-50 shadow-none font-medium tailwind text-zinc-500">
                    {section.items.length} {t('Recommendations')}
                  </Badge>
                  <Badge className="w-9 h-9 p-[10px] rounded-full border-none bg-zinc-50 shadow-none text-zinc-500">
                    <ArrowRightIcon className="w-4 h-4" />
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto">
                {section.items.map((item: InterventionCardItem) => {
                  const displayTitle = getTranslatedTitle(item, translatedTitles);
                  const contentTypeIcon = item.content_type
                    ? getContentTypeIcon(item.content_type)
                    : null;
                  return (
                    <PatientLibraryInterventionCard
                      key={item._id || item.id}
                      item={item}
                      displayTitle={displayTitle}
                      Icon={section.Icon}
                      contentTypeIcon={contentTypeIcon}
                      onClick={() => openDetails(item)}
                      containerClassName="shrink-0 w-72"
                    />
                  );
                })}
              </div>
            </Section>
          ))}
      </div>

      <Sheet open={showTypeSheet} onOpenChange={setShowTypeSheet}>
        <SheetContent side="bottom" className="max-h-[90vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>{activeTypeData?.title}</SheetTitle>
            <SheetDescription>
              {activeTypeData?.items.length} {t('Recommendations')}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto pr-3">
            {activeTypeData && (
              <div className="flex flex-col gap-2">
                {activeTypeData.items.map((item: InterventionCardItem) => {
                  const displayTitle = getTranslatedTitle(item, translatedTitles);
                  const contentTypeIcon = item.content_type
                    ? getContentTypeIcon(item.content_type)
                    : null;
                  return (
                    <PatientLibraryInterventionCard
                      key={item._id || item.id}
                      item={item}
                      displayTitle={displayTitle}
                      Icon={activeTypeData.Icon}
                      contentTypeIcon={contentTypeIcon}
                      onClick={() => openDetails(item)}
                      containerClassName="w-full"
                    />
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
});

export default PatientInterventionsLibrary;
