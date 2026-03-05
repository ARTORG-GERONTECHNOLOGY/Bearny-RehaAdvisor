// src/pages/TherapistRecomendations.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Container } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import Header from '../components/common/Header';
import Footer from '../components/common/Footer';
import WelcomeArea from '../components/common/WelcomeArea';
import ErrorAlert from '../components/common/ErrorAlert';
import ImportInterventionsModal from '../components/TherapistInterventionPage/ImportInterventionsModal';

import ProductPopup from '../components/TherapistInterventionPage/ProductPopup';
import AddInterventionPopup from '../components/AddIntervention/AddRecomendationPopUp'; // ✅ use the updated manual creation popup

import TemplateAssignModal from '../components/TherapistInterventionPage/TemplateAssignModal';
import TemplateTimeline from '../components/TherapistInterventionPage/TemplateTimeline';

import authStore from '../stores/authStore';
import { therapistInterventionsLibraryStore } from '../stores/interventionsLibraryStore';

import config from '../config/config.json';
import apiClient from '../api/client';

import { filterInterventions } from '../utils/filterUtils';
import { generateTagColors, getTaxonomyTags } from '../utils/interventions';
import { translateText } from '../utils/translate';

import type { TemplateItem, TemplatePayload } from '../types/templates';
import type { InterventionTypeTh } from '../types';

import MainTabs from '../components/TherapistInterventionPage/MainTabs';
import LibraryFiltersCard, {
  LibraryFiltersState,
} from '../components/TherapistInterventionPage/LibraryFiltersCard';
import LibraryListSection from '../components/TherapistInterventionPage/LibraryListSection';
import AddInterventionRow from '../components/TherapistInterventionPage/AddInterventionRow';
import TemplatesLayout, {
  TemplatesFiltersState,
} from '../components/TherapistInterventionPage/TemplatesLayout';

// ---------------- Template helpers (unchanged logic, moved out of render) ----------------
const normalizeSegment = (segOrSchedule: any) => {
  const raw = segOrSchedule?.schedule ? segOrSchedule.schedule : segOrSchedule || {};
  const start_day = segOrSchedule?.from_day ?? raw.start_day ?? 1;
  const end_day = raw.end_day ?? segOrSchedule?.end_day;
  const selectedDays = raw.selectedDays || raw.selected_days || [];
  return {
    unit: raw.unit || 'day',
    interval: raw.interval ?? 1,
    selectedDays,
    start_day,
    end_day,
    start_time: raw.start_time || raw.startTime || '08:00',
  };
};

const getSegments = (it: TemplateItem) => {
  const segs = (it as any).segments;
  if (Array.isArray(segs) && segs.length) return segs.map((s: any) => normalizeSegment(s));
  const s = normalizeSegment((it as any).schedule);
  return [s];
};

const countOccurrencesInRange = (it: TemplateItem, fromDay: number, toDay?: number) => {
  const occ = (it as any).occurrences || [];
  return occ.filter((o: any) => o.day >= fromDay && (toDay ? o.day <= toDay : true)).length;
};

const defaultLibraryFilters: LibraryFiltersState = {
  searchTerm: '',
  patientTypeFilter: '',
  contentTypeFilter: '',
  aimsFilter: [],
  tagFilter: [],
  frequencyFilter: '',
};

const defaultTemplatesFilters: TemplatesFiltersState = {
  tSearchTerm: '',
  tPatientTypeFilter: '',
  tDiagnosisFilter: [],
  tContentTypeFilter: '',
  tTagFilter: [],
  tFrequencyFilter: '',
};

const TherapistRecomendations: React.FC = observer(() => {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();

  // ─────────────────────────── tabs ───────────────────────────
  type MainTab = 'library' | 'templates';
  const [mainTab, setMainTab] = useState<MainTab>('library');

  // ─────────────────────────── auth gate ───────────────────────────
  const [authChecked, setAuthChecked] = useState(false);

  // ─────────────────────────── global ui state ───────────────────────────
  const [error, setError] = useState('');

  // ─────────────────────────── popup (details) ───────────────────────────
  const [selectedItem, setSelectedItem] = useState<InterventionTypeTh | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  // ─────────────────────────── add intervention popup ───────────────────────────
  const [showPopupAdd, setShowPopupAdd] = useState(false);

  // ─────────────────────────── templates (defaults) ───────────────────────────
  type TemplateLeftTab = 'my' | 'all';
  const [templateLeftTab, setTemplateLeftTab] = useState<TemplateLeftTab>('my');

  const [templateDiag, setTemplateDiag] = useState<string>('');
  const [templateHorizon, setTemplateHorizon] = useState<number>(84);
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [tLoading, setTLoading] = useState<boolean>(false);

  // ─────────────────────────── import popup ───────────────────────────
  const [showPopupImport, setShowPopupImport] = useState(false);
  const handleOpenImport = () => setShowPopupImport(true);
  const handleCloseImport = () => setShowPopupImport(false);

  // Template assign modal (create/modify)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignInterventionId, setAssignInterventionId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<'create' | 'modify'>('create');

  // ─────────────────────────── Filters (library tab) ───────────────────────────
  const [libraryFilters, setLibraryFilters] = useState<LibraryFiltersState>(defaultLibraryFilters);

  // ─────────────────────────── Filters (templates → Browse All) ───────────────────────────
  const [templatesFilters, setTemplatesFilters] =
    useState<TemplatesFiltersState>(defaultTemplatesFilters);

  // ─────────────────────────── computed data ───────────────────────────
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);
  const patientTypes = authStore.specialisations; // observer() => reactive

  const diagnoses = useMemo(
    () =>
      (authStore.specialisations || []).flatMap(
        (spec) => config?.patientInfo?.function?.[spec]?.diagnosis || []
      ),
    [authStore.specialisations]
  );

  // Store-driven interventions
  const recommendations = therapistInterventionsLibraryStore.items;

  // translated titles (page-local cache)
  type TitleMap = Record<string, { title: string; lang: string | null }>;
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  const filteredInterventions = useMemo(() => {
    return filterInterventions(recommendations, translatedTitles, {
      patientTypeFilter: libraryFilters.patientTypeFilter,
      contentTypeFilter: libraryFilters.contentTypeFilter,
      tagFilter: libraryFilters.tagFilter,
      benefitForFilter: libraryFilters.aimsFilter,
      searchTerm: libraryFilters.searchTerm,
    });
  }, [recommendations, libraryFilters, translatedTitles]);

  const templateFilteredAll = useMemo(() => {
    return filterInterventions(recommendations, translatedTitles, {
      patientTypeFilter: templatesFilters.tPatientTypeFilter,
      contentTypeFilter: templatesFilters.tContentTypeFilter,
      tagFilter: templatesFilters.tTagFilter,
      benefitForFilter: [], // templates don't use aims filter
      searchTerm: templatesFilters.tSearchTerm,
    });
  }, [recommendations, templatesFilters, translatedTitles]);

  // ─────────────────────────── auth check ───────────────────────────
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

  // ─────────────────────────── load library via MobX store ───────────────────────────
  useEffect(() => {
    if (!authChecked) return;

    if (!authStore.isAuthenticated || authStore.userType !== 'Therapist') {
      navigate('/');
      return;
    }

    therapistInterventionsLibraryStore.fetchAll({ mode: 'therapist' });
  }, [authChecked, authStore.isAuthenticated, authStore.userType, navigate]);

  // surface store errors in existing ErrorAlert
  useEffect(() => {
    const storeErr = therapistInterventionsLibraryStore.error;
    if (storeErr) setError(storeErr);
  }, [therapistInterventionsLibraryStore.error]);

  // ─────────────────────────── translate titles ───────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!recommendations.length) {
        if (!cancelled) setTranslatedTitles({});
        return;
      }

      const lang = (i18n.language || 'en').slice(0, 2);

      const pairs = await Promise.all(
        recommendations.map(async (rec) => {
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(rec.title, lang);
            return [
              rec._id,
              { title: translatedText || rec.title, lang: detectedSourceLanguage || null },
            ] as const;
          } catch {
            return [rec._id, { title: rec.title, lang: null }] as const;
          }
        })
      );

      if (!cancelled) setTranslatedTitles(Object.fromEntries(pairs));
    })();

    return () => {
      cancelled = true;
    };
  }, [recommendations, i18n.language]);

  // Ensure template item titles are translated too (only for missing ids)
  useEffect(() => {
    const missing = (templateItems || [])
      .map((it) => it?.intervention?._id)
      .filter(Boolean)
      .filter((id) => !translatedTitles[id as string]) as string[];

    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      const lang = (i18n.language || 'en').slice(0, 2);

      const pairs = await Promise.all(
        missing.map(async (id) => {
          const it = templateItems.find((x) => x.intervention._id === id)!;
          try {
            const { translatedText, detectedSourceLanguage } = await translateText(
              it.intervention.title,
              lang
            );
            return [
              id,
              {
                title: translatedText || it.intervention.title,
                lang: detectedSourceLanguage || null,
              },
            ] as const;
          } catch {
            return [id, { title: it.intervention.title, lang: null }] as const;
          }
        })
      );

      if (!cancelled) {
        setTranslatedTitles((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [templateItems, i18n.language, translatedTitles]);

  // ─────────────────────────── templates fetch + actions ───────────────────────────
  const fetchTemplates = useCallback(
    async (diag?: string, horizon?: number) => {
      try {
        setTLoading(true);
        const q = new URLSearchParams();
        if (diag) q.set('diagnosis', diag);
        if (horizon) q.set('horizon', String(horizon));

        const res = await apiClient.get<TemplatePayload>(
          `therapists/${authStore.id}/template-plan?${q.toString()}`
        );
        setTemplateItems(res.data.items || []);
      } catch {
        setTemplateItems([]);
      } finally {
        setTLoading(false);
      }
    },
    [authStore.id]
  );

  useEffect(() => {
    if (mainTab === 'templates') fetchTemplates(templateDiag, templateHorizon);
  }, [mainTab, templateDiag, templateHorizon, fetchTemplates]);

  const openAssignToTemplate = (id: string, mode: 'create' | 'modify' = 'create') => {
    setAssignMode(mode);
    setAssignInterventionId(id);
    setAssignOpen(true);
  };

  const openModifyTemplate = (it: TemplateItem) => {
    setAssignMode('modify');
    setAssignInterventionId(it.intervention._id);
    setTemplateDiag(it.diagnosis);
    setAssignOpen(true);
  };

  const removeTemplateItem = async (
    diagnosis: string,
    interventionId: string,
    startDay?: number
  ) => {
    try {
      const payload: any = { intervention_id: interventionId, diagnosis };
      if (typeof startDay === 'number') payload.start_day = startDay;

      await apiClient.post(
        `therapists/${authStore.id}/interventions/remove-from-patient-types/`,
        payload
      );

      fetchTemplates(templateDiag, templateHorizon);
    } catch (e: any) {
      const data = e?.response?.data || {};
      const base =
        (Array.isArray(data.non_field_errors) && data.non_field_errors.join(' ')) ||
        data.message ||
        data.error ||
        t('Failed to delete from template.');

      if (data.field_errors) {
        const extra = Object.entries(data.field_errors)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join('\n');
        setError(`${base}\n${extra}`);
      } else {
        setError(base);
      }
    }
  };

  const findTemplateFor = (intId: string): TemplateItem | undefined => {
    if (templateDiag) {
      return templateItems.find(
        (it) => it.diagnosis === templateDiag && it.intervention._id === intId
      );
    }
    return templateItems.find((it) => it.intervention._id === intId);
  };

  const segmentSummary = (seg: any, it: TemplateItem) => {
    const daysStr =
      Array.isArray(seg.selectedDays) && seg.selectedDays.length
        ? ` • ${seg.selectedDays.join(', ')}`
        : '';
    const rangeStr = ` ${t('from day')} ${seg.start_day}${seg.end_day ? ` → ${t('day')} ${seg.end_day}` : ''}`;
    const occCount = countOccurrencesInRange(it, seg.start_day, seg.end_day);
    return `• ${t(seg.unit)}/${seg.interval}${daysStr}${rangeStr} • ${t('Occurrences')} ${occCount}`;
  };

  const handleItemClick = (item: InterventionTypeTh) => {
    setSelectedItem(item);
    setShowPopup(true);
  };

  const handleClosePopup = () => {
    setSelectedItem(null);
    setShowPopup(false);
  };

  const handleTemplateItemClick = (it: TemplateItem) => {
    const full = recommendations.find((r) => r._id === it.intervention._id);
    if (full) handleItemClick(full);
    else
      setError(
        t('Full details for this intervention are not loaded yet. Please refresh the page.')
      );
  };

  // ---- controls ----
  const resetLibraryFilters = () => setLibraryFilters(defaultLibraryFilters);

  const resetTemplateFilters = () => setTemplatesFilters(defaultTemplatesFilters);

  const handleOpenAdd = () => setShowPopupAdd(true);
  const handleCloseAdd = () => setShowPopupAdd(false);

  // store loading (optional: show somewhere)
  const loading = therapistInterventionsLibraryStore.loading;

  return (
    <div className="therapist-view-container">
      <Header isLoggedIn />

      <Container className="main-content mt-4">
        <WelcomeArea user="TherapistPatients" />

        {error && (
          <ErrorAlert
            message={error}
            onClose={() => {
              setError('');
              therapistInterventionsLibraryStore.clearError();
            }}
          />
        )}

        <AddInterventionRow onAdd={handleOpenAdd} onImport={handleOpenImport} />

        <MainTabs mainTab={mainTab} onChange={setMainTab} />

        {mainTab === 'library' ? (
          <>
            <LibraryFiltersCard
              t={t}
              patientTypes={patientTypes}
              filters={libraryFilters}
              onChange={setLibraryFilters}
              onReset={resetLibraryFilters}
            />

            <LibraryListSection
              loading={loading}
              items={filteredInterventions}
              onClick={handleItemClick}
              t={t}
              tagColors={tagColors}
              translatedTitles={translatedTitles}
            />
          </>
        ) : (
          <TemplatesLayout
            t={t}
            // left panel state
            templateDiag={templateDiag}
            onTemplateDiag={setTemplateDiag}
            templateHorizon={templateHorizon}
            onTemplateHorizon={setTemplateHorizon}
            diagnoses={diagnoses}
            patientTypes={patientTypes}
            // sub-tab
            templateLeftTab={templateLeftTab}
            onTemplateLeftTab={setTemplateLeftTab}
            // my template list
            templateItems={templateItems}
            tLoading={tLoading}
            translatedTitles={translatedTitles}
            getSegments={getSegments}
            segmentSummary={segmentSummary}
            onTemplateItemClick={handleTemplateItemClick}
            onModifyTemplate={openModifyTemplate}
            onRemoveTemplateItem={removeTemplateItem}
            // browse all list
            browseAllItems={templateFilteredAll}
            findTemplateFor={findTemplateFor}
            onOpenAssign={openAssignToTemplate}
            // browse filters
            filters={templatesFilters}
            onFilters={setTemplatesFilters}
            onResetFilters={resetTemplateFilters}
            // right timeline
            timeline={
              <TemplateTimeline
                items={templateItems}
                horizonDays={templateHorizon}
                translatedTitles={translatedTitles}
              />
            }
            tagColors={tagColors}
          />
        )}
      </Container>

      {selectedItem && (
        <ProductPopup
          item={selectedItem}
          show={showPopup}
          handleClose={handleClosePopup}
          tagColors={tagColors}
        />
      )}

      <AddInterventionPopup
        show={showPopupAdd}
        handleClose={handleCloseAdd}
        onSuccess={() => therapistInterventionsLibraryStore.fetchAll({ mode: 'therapist' })}
      />

      <ImportInterventionsModal
        show={showPopupImport}
        onHide={handleCloseImport}
        onSuccess={() => therapistInterventionsLibraryStore.fetchAll({ mode: 'therapist' })}
      />

      {assignOpen && (
        <TemplateAssignModal
          show
          onHide={() => setAssignOpen(false)}
          interventionId={assignInterventionId}
          diagnoses={diagnoses}
          defaultDiagnosis={templateDiag || undefined}
          mode={assignMode}
          onSuccess={() => fetchTemplates(templateDiag, templateHorizon)}
        />
      )}

      <Footer />
    </div>
  );
});

export default TherapistRecomendations;
