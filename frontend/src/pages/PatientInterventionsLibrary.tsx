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
import { SearchIcon } from 'lucide-react';
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
};

type InterventionCardProps = {
  item: InterventionCardItem;
  Icon: React.ComponentType<{ className?: string }>;
  containerClassName: string;
};

const InterventionCard: React.FC<InterventionCardProps> = ({ item, Icon, containerClassName }) => (
  <div className={`${containerClassName} rounded-3xl border border-accent p-4 flex flex-col gap-6`}>
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
          <div className="w-4 h-4 bg-red-500 rounded-full" />
          <div className="text-red-500">{item.content_type || '-'}</div>
        </Badge>
      </div>
    </div>
  </div>
);

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

const PatientInterventionsLibrary: React.FC = observer(() => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

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
  const durationBuckets = [5, 20, 35, 50, 60];
  const durationLabels = ['5 min', '20 min', '35 min', '50 min', '1h+'];

  const [searchTerm, setSearchTerm] = useState('');
  const [contentTypeFilter, setContentTypeFilter] = useState<string[]>([]);
  const [aimsFilter, setAimsFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [durationFilterIndices, setDurationFilterIndices] = useState<[number, number]>([0, 4]);

  const resetAllFilters = useCallback(() => {
    setSearchTerm('');
    setContentTypeFilter([]);
    setAimsFilter([]);
    setTagFilter([]);
    setDurationFilterIndices([0, 4]);
  }, []);

  // ─────────────────────────── fetch list via store ───────────────────────────
  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
      navigate('/');
      return;
    }

    // ✅ Let backend pick best variant per external_id
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

      const lang = (i18n.language || 'en').slice(0, 2);

      // Only translate if needed (cheap heuristic)
      const pairs = await Promise.all(
        sourceItems.map(async (rec: any) => {
          const id = rec._id || rec.id;
          const rawTitle = String(rec.title || rec.intervention_title || '').trim();
          if (!id || !rawTitle)
            return [id || Math.random().toString(), { title: rawTitle, lang: null }] as const;

          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rawTitle, lang);
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
      tagFilter,
      benefitForFilter: [], // patient library uses aims+tags; keep this empty
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
    tagFilter,
    aimsFilter,
    searchTerm,
    translatedTitles,
    durationFilterIndices,
    durationBuckets,
  ]);

  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);

  const typeOptions = useMemo(() => {
    const byNormalized = new Map<string, string>();

    sourceItems
      .map((it: any) => it.aims)
      .flat()
      .filter(Boolean)
      .forEach((raw: string) => {
        const value = String(raw).trim();
        const normalized = value.toLocaleLowerCase();
        if (!byNormalized.has(normalized)) {
          byNormalized.set(normalized, value);
        }
      });

    return Array.from(byNormalized.values()).map((t) => ({
      value: t,
      label: t,
      Icon: getTypeIcon(t),
    }));
  }, [sourceItems]);

  const contentOptions = useMemo(() => {
    const byNormalized = new Map<string, string>();

    sourceItems
      .map((it: any) => it.content_type)
      .filter(Boolean)
      .forEach((raw: string) => {
        const value = String(raw).trim();
        const normalized = value.toLocaleLowerCase();
        if (!byNormalized.has(normalized)) {
          byNormalized.set(normalized, value);
        }
      });

    return Array.from(byNormalized.values()).map((t) => ({
      value: t,
      label: t,
      Icon: getContentTypeIcon(t),
    }));
  }, [sourceItems]);

  const exerciseItems = useMemo(
    () =>
      filteredItems.filter((it: any) =>
        (Array.isArray(it?.aims) ? it.aims : []).some((aim: string) =>
          String(aim).toLocaleLowerCase().includes('exercise')
        )
      ),
    [filteredItems]
  );

  const educationItems = useMemo(
    () =>
      filteredItems.filter((it: any) =>
        (Array.isArray(it?.aims) ? it.aims : []).some((aim: string) =>
          String(aim).toLocaleLowerCase().includes('education')
        )
      ),
    [filteredItems]
  );

  const instructionItems = useMemo(
    () =>
      filteredItems.filter((it: any) =>
        (Array.isArray(it?.aims) ? it.aims : []).some((aim: string) =>
          String(aim).toLocaleLowerCase().includes('instruction')
        )
      ),
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

  return (
    <Layout>
      <h1 className="text-2xl font-bold">{t('Library')}</h1>

      <div className="flex gap-2 mt-14">
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

        <Button
          onClick={() => setShowFilterSheet(true)}
          className="rounded-full border border-accent bg-white p-4 shadow-none w-14 h-14"
        >
          <BarsFilterIcon className="w-6 h-6 text-zinc-800" />
        </Button>
      </div>

      {/* Loading */}
      {storeLoading && (
        <div className="flex flex-col gap-2 h-full">
          <Skeleton className="w-full h-24 rounded-[40px]" />
          <Skeleton className="w-full h-24 rounded-[40px]" />
          <Skeleton className="w-full h-24 rounded-[40px]" />
        </div>
      )}

      {/* Error */}
      {storeError && (
        <ErrorAlert
          message={storeError}
          onClose={() => patientInterventionsLibraryStore.clearError()}
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
      <div className="mt-6 flex flex-col gap-2">
        {visibleTypeSections.map((section) => (
          <section key={section.key} className="flex flex-col gap-2 rounded-[40px] bg-white p-4">
            <div className="p-2 pl-4 flex items-center justify-between">
              <div className="flex items-center gap-3 font-semibold text-lg text-zinc-500">
                <span>{section.title}</span>
              </div>
              <div className="flex gap-1">
                <Badge className="px-3 py-2 rounded-full border-none bg-zinc-50 shadow-none font-medium tailwind text-zinc-500">
                  {section.items.length} {t('Recommendations')}
                </Badge>
                <Badge
                  className="p-[10px] rounded-full border-none bg-zinc-50 shadow-none text-zinc-500"
                  onClick={() => {
                    setActiveTypeSection(section.key);
                    setShowTypeSheet(true);
                  }}
                >
                  <ArrowRightIcon className="w-4 h-4" />
                </Badge>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto">
              {section.items.map((item: any) => (
                <InterventionCard
                  key={item._id || item.id}
                  item={item}
                  Icon={section.Icon}
                  containerClassName="shrink-0 w-72"
                />
              ))}
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
                {activeTypeData.items.map((item: any) => (
                  <InterventionCard
                    key={item._id || item.id}
                    item={item}
                    Icon={activeTypeData.Icon}
                    containerClassName="w-full"
                  />
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Layout>
  );
});

export default PatientInterventionsLibrary;
