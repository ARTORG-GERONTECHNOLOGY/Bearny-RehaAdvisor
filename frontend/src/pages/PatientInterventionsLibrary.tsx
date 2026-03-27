// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';
import Layout from '@/components/Layout';

import authStore from '@/stores/authStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

import { filterInterventions } from '@/utils/filterUtils';
import { translateText } from '@/utils/translate';
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SearchIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import BarsFilterIcon from '@/assets/icons/bars-filter-fill.svg?react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';
import AudioIcon from '@/assets/icons/interventions/audio.svg?react';
import TextIcon from '@/assets/icons/interventions/text.svg?react';
import VideoIcon from '@/assets/icons/interventions/video.svg?react';
import WebsiteIcon from '@/assets/icons/interventions/website.svg?react';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import ClockIcon from '@/assets/icons/interventions/clock.svg?react';
import ArrowRightIcon from '@/assets/icons/arrow-right-fill.svg?react';

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

type InterventionCardProps = {
  item: InterventionCardItem;
  Icon: React.ComponentType<{ className?: string }>;
  containerClassName: string;
  onClick: () => void;
};

const InterventionCard: React.FC<InterventionCardProps> = ({
  item,
  Icon,
  containerClassName,
  onClick,
}) => {
  const ContentTypeIcon = item.content_type ? getContentTypeIcon(item.content_type) : null;

  return (
    <div
      role="button"
      onClick={onClick}
      className={`${containerClassName} rounded-3xl border border-accent p-4 flex flex-col gap-6`}
    >
      <Icon className="shrink-0 w-8 h-8" />
      <div className="flex-1 flex flex-col gap-2 justify-between">
        <div className="font-bold text-lg leading-6 text-zinc-800">{item.title || '-'}</div>
        <div className="flex gap-1">
          <Badge className="flex gap-1 bg-white py-2 px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500">
            <ClockIcon className="w-4 h-4" />
            <div className="text-[#00956C] font-medium">
              {isNaN(Number(item.duration)) ? '-' : `${item.duration}min`}
            </div>
          </Badge>
          <Badge className="flex gap-1 bg-white py-2 px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500">
            {ContentTypeIcon && <ContentTypeIcon className="w-4 h-4" />}
            <div className="text-[#00956C] font-medium">{item.content_type || '-'}</div>
          </Badge>
        </div>
      </div>
    </div>
  );
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
  if (normalized.includes('website')) return WebsiteIcon;

  return null;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const durationBuckets = [5, 20, 35, 50, 60];
const durationLabels = ['5 min', '20 min', '35 min', '50 min', '1h+'];

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

    // Let backend pick best variant per external_id
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

      <button
        type="button"
        aria-label={t('Close search')}
        onClick={() => setSearchTerm('')}
        className={`fixed inset-0 z-10 bg-black/60 transition-opacity duration-200 ${
          isSearchOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div className="relative mx-4 mt-14 h-14">
        <div
          className={`absolute z-20 transition-all duration-200 ease-out ${
            isSearchOpen
              ? 'rounded-[40px] border-none bg-white -left-6 -right-6 -top-6 p-4'
              : 'bg-transparent p-0 left-0 right-0 top-0'
          }`}
        >
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Field>
                <InputGroup className="rounded-full border border-accent bg-white h-14 !px-5 !py-4">
                  <InputGroupInput
                    id="inline-end-input"
                    type="text"
                    placeholder={t('Search')}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="p-0 !text-lg font-medium placeholder:text-zinc-400"
                  />
                  <InputGroupAddon align="inline-end" className="p-0">
                    <SearchIcon className="size-5 text-zinc-300" />
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </div>

            {isSearchOpen ? (
              <Button
                onClick={() => setSearchTerm('')}
                className="rounded-full border border-accent bg-zinc-100 p-4 shadow-none w-14 h-14"
                aria-label={t('Close search')}
              >
                <X className="w-6 h-6 text-zinc-500" />
              </Button>
            ) : (
              <Button
                onClick={() => setShowFilterSheet(true)}
                className="rounded-full border border-accent bg-white p-4 shadow-none w-14 h-14"
              >
                <BarsFilterIcon className="w-6 h-6 text-zinc-800" />
              </Button>
            )}
          </div>

          <div
            className={`grid overflow-hidden transition-all duration-200 ease-out ${
              isSearchOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="mt-6">
              {searchResults.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div className="font-medium text-sm text-zinc-500">
                    {searchResults.length} {t('Recommendations')}
                  </div>
                  {searchResults.map((item) => {
                    const title = getTranslatedTitle(item, translatedTitles);
                    const contentType = String(item?.content_type || '-').trim();
                    const durationText = isNaN(Number(item?.duration))
                      ? '-'
                      : `${item.duration}min`;
                    const ResultIcon =
                      getTypeIcon(Array.isArray(item?.aims) ? String(item.aims[0] || '') : '') ||
                      EducationIcon;
                    return (
                      <button
                        key={item._id || item.id}
                        type="button"
                        onClick={() => openDetails(item)}
                        className="w-full text-left rounded-3xl p-4 bg-zinc-50 hover:bg-zinc-100 transition-colors border border-accent"
                      >
                        <div className="flex gap-3">
                          <ResultIcon className="w-8 h-8 shrink-0" />
                          <div className="flex-1 flex flex-col gap-1 min-w-0">
                            <div className="font-bold text-lg line-clamp-2 text-zinc-400">
                              {renderHighlightedTitle(title)}
                            </div>
                            <div className="flex items-center gap-2 font-medium text-sm text-zinc-500 truncate">
                              <span>{durationText}</span>
                              <span>•</span>
                              <span className="capitalize">{contentType}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-zinc-400">{t('No entries found.')}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {storeError && (
        <ErrorAlert
          message={storeError}
          onClose={() => patientInterventionsLibraryStore.clearError()}
          className="mt-6"
        />
      )}

      {/* Filters */}
      <Sheet open={showFilterSheet} onOpenChange={(isOpen) => !isOpen && setShowFilterSheet(false)}>
        <SheetContent side="bottom" className="max-h-[90vh] flex flex-col">
          <SheetHeader>
            <SheetTitle>{t('Filter')}</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-12 flex-1 overflow-y-auto pr-3">
            <div className="flex flex-col gap-4">
              <div className="font-medium text-lg text-zinc-600">{t('Type')}</div>
              <div className="flex flex-col gap-3">
                {typeOptions.map((option) => (
                  <div key={option.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                      {option.Icon ? (
                        <option.Icon className="w-6 h-6" />
                      ) : (
                        <div className="w-6 h-6" />
                      )}
                      <span>{option.label}</span>
                    </div>
                    <Switch
                      checked={aimsFilter.includes(option.value)}
                      onCheckedChange={() =>
                        setAimsFilter((prev) =>
                          prev.includes(option.value)
                            ? prev.filter((v) => v !== option.value)
                            : [...prev, option.value]
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="font-medium text-lg text-zinc-600">Medium</div>
              <div className="flex flex-col gap-3">
                {contentOptions.map((option) => (
                  <div key={option.value} className="flex items-center justify-between">
                    <div className="flex items-center gap-3 font-bold text-lg leading-6 text-zinc-800">
                      {option.Icon ? (
                        <option.Icon className="w-6 h-6" />
                      ) : (
                        <div className="w-6 h-6" />
                      )}
                      <span>{option.label}</span>
                    </div>
                    <Switch
                      checked={contentTypeFilter.includes(option.value)}
                      onCheckedChange={() =>
                        setContentTypeFilter((prev) =>
                          prev.includes(option.value)
                            ? prev.filter((v) => v !== option.value)
                            : [...prev, option.value]
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="font-medium text-lg text-zinc-600">Dauer</div>
              <Slider
                value={durationFilterIndices}
                min={0}
                max={4}
                step={1}
                onValueChange={(value) => setDurationFilterIndices([value[0], value[1]])}
              />
              <div className="flex justify-between font-medium text-sm text-zinc-400 px-0.5">
                {durationLabels.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
            </div>
          </div>

          <SheetFooter className="flex gap-2 shrink-0">
            <Button
              onClick={resetAllFilters}
              className="px-5 py-4 bg-zinc-50 shadow-none border border-accent rounded-full text-lg font-medium text-zinc-800"
            >
              {t('Reset filters')}
            </Button>
            <Button
              onClick={() => setShowFilterSheet(false)}
              className="px-5 py-4 bg-[#00956C] shadow-none border-none rounded-full text-lg font-medium text-zinc-50"
            >
              {t('Apply')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Lists by type */}
      <div className="mt-16 flex flex-col gap-2">
        {storeLoading && (
          <>
            <Skeleton className="w-full h-24 rounded-[40px]" />
            <Skeleton className="w-full h-24 rounded-[40px]" />
            <Skeleton className="w-full h-24 rounded-[40px]" />
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

        {visibleTypeSections.map((section) => (
          <section
            key={section.key}
            role="button"
            onClick={() => {
              setActiveTypeSection(section.key);
              setShowTypeSheet(true);
            }}
            className="flex flex-col gap-2 rounded-[40px] bg-white p-4"
          >
            <div className="p-2 pl-4 flex items-center justify-between">
              <div className="flex items-center gap-3 font-semibold text-lg text-zinc-500">
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
                return (
                  <InterventionCard
                    key={item._id || item.id}
                    item={{ ...item, title: displayTitle }}
                    Icon={section.Icon}
                    onClick={() => openDetails(item)}
                    containerClassName="shrink-0 w-72"
                  />
                );
              })}
            </div>
          </section>
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
                  return (
                    <InterventionCard
                      key={item._id || item.id}
                      item={{ ...item, title: displayTitle }}
                      Icon={activeTypeData.Icon}
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
