// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';
import InterventionList from '@/components/TherapistInterventionPage/InterventionList';
import InterventionFiltersCard from '@/components/PatientLibrary/InterventionFiltersCard';
import Layout from '@/components/Layout';

import authStore from '@/stores/authStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

import { generateTagColors, getTaxonomyTags } from '@/utils/interventions';
import { filterInterventions } from '@/utils/filterUtils';
import { translateText } from '@/utils/translate';
import { Field } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import BarsFilterIcon from '@/assets/icons/bars-filter-fill.svg?react';

type TitleMap = Record<string, { title: string; lang: string | null }>;

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
  const [searchTerm, setSearchTerm] = useState('');
  const [contentType, setContentType] = useState('');
  const [aimsFilter, setAimsFilter] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const resetAllFilters = useCallback(() => {
    setSearchTerm('');
    setContentType('');
    setAimsFilter([]);
    setTagFilter([]);
  }, []);

  // ─────────────────────────── tag colors ───────────────────────────
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);

  const openDetails = useCallback(
    (item: { _id?: string; id?: string; intervention_id?: string }) => {
      const interventionId = item.intervention_id || item._id || item.id;
      if (!interventionId) return;
      navigate(`/patient-intervention/${interventionId}`);
    },
    [navigate]
  );

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
      contentTypeFilter: contentType,
      tagFilter,
      benefitForFilter: [], // patient library uses aims+tags; keep this empty
      searchTerm,
    });

    if (!aimsFilter.length) return base;

    return base.filter((it: any) => {
      const aims: string[] = Array.isArray(it?.aims) ? it.aims : [];
      return aimsFilter.every((a) => aims.includes(a));
    });
  }, [sourceItems, contentType, tagFilter, aimsFilter, searchTerm, translatedTitles]);

  const [showFilterSheet, setShowFilterSheet] = useState<boolean>(false);

  return (
    <Layout>
      <h1 className="text-2xl font-bold">{t('Library')}</h1>

      {/* Error */}
      {storeError && (
        <ErrorAlert
          message={storeError}
          onClose={() => patientInterventionsLibraryStore.clearError()}
        />
      )}

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

      {/* Filters */}
      <Sheet open={showFilterSheet} onOpenChange={(isOpen) => !isOpen && setShowFilterSheet(false)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{t('Filter')}</SheetTitle>
          </SheetHeader>

          <InterventionFiltersCard
            items={sourceItems as any}
            searchTerm={searchTerm}
            onSearchTerm={setSearchTerm}
            contentType={contentType}
            onContentType={setContentType}
            aimsFilter={aimsFilter}
            onAimsFilter={setAimsFilter}
            tagFilter={tagFilter}
            onTagFilter={setTagFilter}
            loading={storeLoading}
            resultCount={filteredItems.length}
            onReset={resetAllFilters}
          />

          <SheetFooter className="flex gap-2">
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

      {/* List */}
      <InterventionList
        items={filteredItems as any}
        onClick={openDetails}
        t={t}
        tagColors={tagColors}
        translatedTitles={translatedTitles}
      />
    </Layout>
  );
});

export default PatientInterventionsLibrary;
