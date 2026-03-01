// src/pages/PatientInterventionsLibrary.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import ErrorAlert from '@/components/common/ErrorAlert';
import InterventionList from '@/components/TherapistInterventionPage/InterventionList';
import LibraryTabs, { type MainTab } from '@/components/PatientLibrary/LibraryTabs';
import InterventionFiltersCard from '@/components/PatientLibrary/InterventionFiltersCard';
import PatientInterventionDetailsModal from '@/components/PatientLibrary/PatientInterventionDetailsModal';
import Layout from '@/components/Layout';

import authStore from '@/stores/authStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';

import { generateTagColors, getTaxonomyTags } from '@/utils/interventions';
import { filterInterventions } from '@/utils/filterUtils';
import { translateText } from '@/utils/translate';

import type { InterventionTypeTh } from '@/types';

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

  // ─────────────────────────── tabs ───────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('library');

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

  // ─────────────────────────── popup ───────────────────────────
  const [selectedItem, setSelectedItem] = useState<InterventionTypeTh | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const openDetails = useCallback((item: InterventionTypeTh) => {
    setSelectedItem(item);
    setShowDetails(true);
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedItem(null);
    setShowDetails(false);
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
    const base = filterInterventions(sourceItems as any, {
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
  }, [sourceItems, contentType, tagFilter, aimsFilter, searchTerm]);

  return (
    <Layout>
      <div className="d-flex flex-column min-vh-100">
        <div className="flex-grow-1">
          <Container className="py-3 py-sm-4">
            {/* Error */}
            {storeError && (
              <Row className="mb-3">
                <Col>
                  <ErrorAlert
                    message={storeError}
                    onClose={() => patientInterventionsLibraryStore.clearError()}
                  />
                </Col>
              </Row>
            )}

            {/* Tabs */}
            <Row className="mb-3">
              <Col>
                <LibraryTabs value={mainTab} onChange={setMainTab} />
              </Col>
            </Row>

            {/* Filters */}
            <Row className="mb-3">
              <Col>
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
              </Col>
            </Row>

            {/* List */}
            <Row>
              <Col xs={12}>
                <div className="w-full overflow-hidden">
                  <InterventionList
                    items={filteredItems as any}
                    onClick={openDetails}
                    t={t}
                    tagColors={tagColors}
                    translatedTitles={translatedTitles}
                  />
                </div>
              </Col>
            </Row>
          </Container>

          {/* Details modal */}
          <PatientInterventionDetailsModal
            item={selectedItem}
            show={showDetails}
            onClose={closeDetails}
          />
        </div>
      </div>
    </Layout>
  );
});

export default PatientInterventionsLibrary;
