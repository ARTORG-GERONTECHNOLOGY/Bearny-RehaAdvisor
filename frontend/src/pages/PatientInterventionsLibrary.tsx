// src/pages/PatientInterventionsLibrary.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';
import PageHeader from '@/components/PageHeader';

import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

import PatientLibraryFilterSheet from '@/components/PatientLibrary/PatientLibraryFilterSheet';
import PatientLibraryDesktopFilters from '@/components/PatientLibrary/PatientLibraryDesktopFilters';
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
import Section from '@/components/Section';
import { PatientInterventionsLibrarySectionsSkeleton } from '@/components/skeletons/PatientInterventionsLibrarySkeleton';

import { getTypeIcon, getContentTypeIcon } from '@/utils/interventions';
import flagDe from '@/assets/flags/de.png';
import flagFr from '@/assets/flags/fr.png';
import flagEn from '@/assets/flags/gb.png';
import flagIt from '@/assets/flags/it.png';
import flagPt from '@/assets/flags/pt.png';
import flagNl from '@/assets/flags/be.png';
import { Badge } from '@/components/ui/badge';
import ArrowRightIcon from '@/assets/icons/arrow-right-fill.svg?react';
import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';

type TitleMap = Record<string, { title: string; lang: string | null }>;

type InterventionCardItem = {
  _id?: string | number;
  id?: string | number;
  title?: string;
  duration?: string | number;
  content_type?: string;
  avg_rating?: number | null;
  aims?: string[];
  intervention_title?: string;
  intervention_id?: string;
  language?: string;
  available_languages?: string[];
};

type OptionItem = {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }> | null;
};

const flagMap: Record<string, string> = {
  en: flagEn,
  de: flagDe,
  fr: flagFr,
  it: flagIt,
  pt: flagPt,
  nl: flagNl,
};

const languageNames: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
};

const getLanguageIcon = (value: string): React.ComponentType<{ className?: string }> | null => {
  const lang = value.trim().toLowerCase();
  const src = flagMap[lang];
  if (!src) return null;
  const FlagIcon = ({ className }: { className?: string }) => (
    <img src={src} className={`${className ?? ''} rounded-full object-cover`} alt={lang} />
  );
  return FlagIcon;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const durationBuckets = [5, 20, 35, 50, 60];
const durationLabels = ['5min', '20min', '35min', '50min', '1h+'];

const ratingBuckets = [1, 2, 3, 4, 5];
const ratingLabels = ['1', '2', '3', '4', '5'];

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

// ─────────────────────────── filter session persistence ───────────────────────────
const FILTER_SESSION_KEY = 'patientLibraryFilters';

type FilterState = {
  searchTerm: string;
  contentTypeFilter: string[];
  aimsFilter: string[];
  languageFilter: string[];
  durationFilterIndices: [number, number];
  ratingFilterIndices: [number, number];
};

const DEFAULT_FILTERS: FilterState = {
  searchTerm: '',
  contentTypeFilter: [],
  aimsFilter: [],
  languageFilter: [],
  durationFilterIndices: [0, 4],
  ratingFilterIndices: [0, 4],
};

const loadFilters = (): FilterState => {
  try {
    const raw = sessionStorage.getItem(FILTER_SESSION_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_FILTERS;
};

const saveFilters = (filters: FilterState) => {
  try {
    sessionStorage.setItem(FILTER_SESSION_KEY, JSON.stringify(filters));
  } catch {
    // ignore
  }
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
  const { isAllowed } = useRoleAuthGate('Patient');

  // ─────────────────────────── filters ───────────────────────────
  const initialFilters = useMemo(() => loadFilters(), []);
  const [searchTerm, setSearchTerm] = useState(initialFilters.searchTerm);
  const [contentTypeFilter, setContentTypeFilter] = useState(initialFilters.contentTypeFilter);
  const [aimsFilter, setAimsFilter] = useState(initialFilters.aimsFilter);
  const [languageFilter, setLanguageFilter] = useState(initialFilters.languageFilter);
  const [durationFilterIndices, setDurationFilterIndices] = useState(
    initialFilters.durationFilterIndices
  );
  const [ratingFilterIndices, setRatingFilterIndices] = useState(
    initialFilters.ratingFilterIndices
  );

  useEffect(() => {
    saveFilters({
      searchTerm,
      contentTypeFilter,
      aimsFilter,
      languageFilter,
      durationFilterIndices,
      ratingFilterIndices,
    });
  }, [
    searchTerm,
    contentTypeFilter,
    aimsFilter,
    languageFilter,
    durationFilterIndices,
    ratingFilterIndices,
  ]);

  const resetAllFilters = useCallback(() => {
    setSearchTerm(DEFAULT_FILTERS.searchTerm);
    setContentTypeFilter(DEFAULT_FILTERS.contentTypeFilter);
    setAimsFilter(DEFAULT_FILTERS.aimsFilter);
    setLanguageFilter(DEFAULT_FILTERS.languageFilter);
    setDurationFilterIndices(DEFAULT_FILTERS.durationFilterIndices);
    setRatingFilterIndices(DEFAULT_FILTERS.ratingFilterIndices);
    saveFilters(DEFAULT_FILTERS);
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
    if (!isAllowed) return;

    const lang = i18n.language.slice(0, 2);
    patientInterventionsLibraryStore.fetchAll({ mode: 'patient', lang });
  }, [isAllowed, i18n.language]);

  const sourceItems = patientInterventionsLibraryStore.visibleItemsForPatient;
  const storeError = patientInterventionsLibraryStore.error;
  const storeLoading = patientInterventionsLibraryStore.loading;

  // ─────────────────────────── (optional) translate titles cache ───────────────────────────
  // Translations are cached in sessionStorage keyed by "lang:id" so navigating
  // away and back (or switching tabs) does not re-fire hundreds of HTTP requests.
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  const _translationCacheKey = 'intervention_title_translations_v1';

  const _readTranslationCache = (): Record<string, { title: string; lang: string | null }> => {
    try {
      return JSON.parse(sessionStorage.getItem(_translationCacheKey) ?? '{}');
    } catch {
      return {};
    }
  };

  const _writeTranslationCache = (
    updates: Record<string, { title: string; lang: string | null }>
  ): void => {
    try {
      const existing = _readTranslationCache();
      sessionStorage.setItem(_translationCacheKey, JSON.stringify({ ...existing, ...updates }));
    } catch {
      // storage quota — skip
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!sourceItems.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      const lang = i18n.language;
      const cache = _readTranslationCache();

      // Seed state immediately from cache so already-translated items render at once
      const fromCache: TitleMap = {};
      const toFetch: InterventionCardItem[] = [];

      for (const rec of sourceItems as InterventionCardItem[]) {
        const id = rec._id || rec.id;
        const cacheHit = id ? cache[`${lang}:${id}`] : undefined;
        if (cacheHit) {
          fromCache[String(id)] = cacheHit;
        } else {
          toFetch.push(rec);
        }
      }

      if (!cancelled) setTranslatedTitles(fromCache);

      if (!toFetch.length) return;

      const pairs = await Promise.all(
        toFetch.map(async (rec) => {
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

      const newEntries = Object.fromEntries(pairs);
      // Persist to session cache keyed by language
      const cacheUpdates: Record<string, { title: string; lang: string | null }> = {};
      for (const [id, val] of Object.entries(newEntries)) {
        cacheUpdates[`${lang}:${id}`] = val;
      }
      _writeTranslationCache(cacheUpdates);

      if (!cancelled) setTranslatedTitles({ ...fromCache, ...newEntries });
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
      diagnosisFilter: [],
      languageFilter: languageFilter.map((l) => l.toLowerCase()),
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

    const withRating = withDuration.filter((it: any) => {
      const rating = Number(it?.avg_rating);
      const isFullRatingRange = ratingFilterIndices[0] === 0 && ratingFilterIndices[1] === 4;
      if (isNaN(rating) || it?.avg_rating == null) return isFullRatingRange;

      const minRating = ratingBuckets[ratingFilterIndices[0]];
      const maxRating = ratingBuckets[ratingFilterIndices[1]];
      return rating >= minRating && rating <= maxRating;
    });

    return withRating;
  }, [
    sourceItems,
    contentTypeFilter,
    aimsFilter,
    languageFilter,
    searchTerm,
    translatedTitles,
    durationFilterIndices,
    durationBuckets,
    ratingFilterIndices,
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

  const languageOptions = useMemo(() => {
    return buildUniqueOptions(
      sourceItems as InterventionCardItem[],
      (item) => [...(item.available_languages ?? []), ...(item.language ? [item.language] : [])],
      getLanguageIcon
    ).map((opt) => ({
      ...opt,
      label: languageNames[opt.value.toLowerCase()] ?? opt.value.toUpperCase(),
    }));
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
        title: t('Instructions'),
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
      <PageHeader title={t('Library')} />
      <div className="lg:hidden">
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
      </div>

      {/* Error */}
      {storeError && (
        <ErrorAlert
          message={storeError}
          onClose={() => patientInterventionsLibraryStore.clearError()}
          className="mt-6"
        />
      )}

      {/* Mobile Filters */}
      <div className="lg:hidden">
        <PatientLibraryFilterSheet
          open={showFilterSheet}
          onOpenChange={(isOpen) => !isOpen && setShowFilterSheet(false)}
          filteredCount={filteredItems.length}
          typeOptions={typeOptions}
          contentOptions={contentOptions}
          languageOptions={languageOptions}
          aimsFilter={aimsFilter}
          setAimsFilter={setAimsFilter}
          contentTypeFilter={contentTypeFilter}
          setContentTypeFilter={setContentTypeFilter}
          languageFilter={languageFilter}
          setLanguageFilter={setLanguageFilter}
          durationFilterIndices={durationFilterIndices}
          setDurationFilterIndices={setDurationFilterIndices}
          durationLabels={durationLabels}
          ratingFilterIndices={ratingFilterIndices}
          setRatingFilterIndices={setRatingFilterIndices}
          ratingLabels={ratingLabels}
          onResetFilters={resetAllFilters}
        />
      </div>

      <div className="lg:mt-8 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6">
        <PatientLibraryDesktopFilters
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          typeOptions={typeOptions}
          contentOptions={contentOptions}
          languageOptions={languageOptions}
          aimsFilter={aimsFilter}
          setAimsFilter={setAimsFilter}
          contentTypeFilter={contentTypeFilter}
          setContentTypeFilter={setContentTypeFilter}
          languageFilter={languageFilter}
          setLanguageFilter={setLanguageFilter}
          durationFilterIndices={durationFilterIndices}
          setDurationFilterIndices={setDurationFilterIndices}
          durationLabels={durationLabels}
          ratingFilterIndices={ratingFilterIndices}
          setRatingFilterIndices={setRatingFilterIndices}
          ratingLabels={ratingLabels}
        />

        {/* Lists by type */}
        <div className="mt-16 flex flex-col gap-2 lg:mt-0">
          {storeLoading && <PatientInterventionsLibrarySectionsSkeleton />}

          {!storeLoading && visibleTypeSections.length === 0 && (
            <div className="flex flex-col gap-2 items-center justify-center py-12 px-4">
              <div className="text-lg font-medium text-zinc-600 text-center">
                {t('No entries found.')}
              </div>
              <Button onClick={resetAllFilters}>{t('Reset filters')}</Button>
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
                    <Badge variant="section">
                      {section.items.length} {t('Contents')}
                    </Badge>
                    <Badge variant="section" className="w-9 h-9 p-[10px]">
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
      </div>

      <Sheet open={showTypeSheet} onOpenChange={setShowTypeSheet}>
        <SheetContent side="bottom" className="max-h-[90vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>{activeTypeData?.title}</SheetTitle>
            <SheetDescription>
              {activeTypeData?.items.length} {t('Contents')}
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
