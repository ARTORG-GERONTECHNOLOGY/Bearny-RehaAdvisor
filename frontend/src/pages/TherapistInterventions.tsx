// src/pages/TherapistRecomendations.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Container, Card, Form, Button, ButtonGroup, Spinner, Modal } from 'react-bootstrap';
import { FaPlus, FaTrash, FaCopy, FaUpload, FaEdit, FaBell } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';

import WelcomeArea from '@/components/common/WelcomeArea';
import ErrorAlert from '@/components/common/ErrorAlert';
import ImportInterventionsModal from '@/components/TherapistInterventionPage/ImportInterventionsModal';

import ProductPopup from '@/components/TherapistInterventionPage/ProductPopup';
import AddInterventionPopup from '@/components/AddIntervention/AddRecomendationPopUp'; // ✅ use the updated manual creation popup

import TemplateAssignModal from '@/components/TherapistInterventionPage/TemplateAssignModal';
import TemplateTimeline from '@/components/TherapistInterventionPage/TemplateTimeline';

import authStore from '@/stores/authStore';
import { therapistInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';
import templateStore from '@/stores/templateStore';
import ApplyTemplateModal from '@/components/TherapistInterventionPage/ApplyTemplateModal';

import config from '@/config/config.json';
import apiClient from '@/api/client';

import { filterInterventions } from '@/utils/filterUtils';
import { generateTagColors, getTaxonomyTags } from '@/utils/interventions';
import { translateText } from '@/utils/translate';

import type { TemplateItem, TemplatePayload } from '@/types/templates';
import type { InterventionTypeTh } from '@/types';

import MainTabs from '@/components/TherapistInterventionPage/MainTabs';
import LibraryFiltersCard, {
  LibraryFiltersState,
} from '@/components/TherapistInterventionPage/LibraryFiltersCard';
import LibraryListSection from '@/components/TherapistInterventionPage/LibraryListSection';
import AddInterventionRow from '@/components/TherapistInterventionPage/AddInterventionRow';
import TemplatesLayout, {
  TemplatesFiltersState,
} from '@/components/TherapistInterventionPage/TemplatesLayout';
import Layout from '@/components/Layout';

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
  diagnosisFilter: [],
  languageFilter: [],
  contentTypeFilter: '',
  aimsFilter: [],
  tagFilter: [],
};

const defaultTemplatesFilters: TemplatesFiltersState = {
  tSearchTerm: '',
  tDiagnosisFilter: [],
  tLanguageFilter: [],
  tContentTypeFilter: '',
  tTagFilter: [],
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

  // ─────────────────────────── named templates ───────────────────────────
  const [activeTemplateId, setActiveTemplateId] = useState<string>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDesc, setNewTemplateDesc] = useState('');
  const [newTemplatePublic, setNewTemplatePublic] = useState(false);
  const [newTemplateSubmitting, setNewTemplateSubmitting] = useState(false);

  // ─────────────────────────── copy modal ───────────────────────────
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyModalName, setCopyModalName] = useState('');
  const [copyModalDesc, setCopyModalDesc] = useState('');
  const [copyModalSubmitting, setCopyModalSubmitting] = useState(false);

  // ─────────────────────────── edit meta modal ───────────────────────────
  const [showEditMetaModal, setShowEditMetaModal] = useState(false);
  const [editMetaName, setEditMetaName] = useState('');
  const [editMetaDesc, setEditMetaDesc] = useState('');
  const [editMetaPublic, setEditMetaPublic] = useState(false);
  const [editMetaSubmitting, setEditMetaSubmitting] = useState(false);

  // ─────────────────────────── change notifications ───────────────────────────
  type InterventionRef = {
    id: string;
    title: string;
    diagnosis: string;
    start_day: number;
    end_day: number | null;
    unit: string;
    interval: number;
    selectedDays: string[];
  };
  type TemplateSeen = {
    updatedAt: string;
    name: string;
    description: string;
    intervention_count: number;
    interventions: InterventionRef[];
  };
  type ModifiedRef = { prev: InterventionRef; curr: InterventionRef };
  type TemplateDiff = {
    date: string;
    metaChanges: string[];
    added: InterventionRef[];
    removed: InterventionRef[];
    modified: ModifiedRef[];
  };

  const [seenMap, setSeenMap] = useState<Record<string, TemplateSeen>>(() => {
    try {
      return JSON.parse(localStorage.getItem('templateSeenMap') || '{}');
    } catch {
      return {};
    }
  });
  const seenMapRef = useRef(seenMap);
  useEffect(() => {
    seenMapRef.current = seenMap;
  }, [seenMap]);

  // In-memory diffs computed this session — cleared on page refresh
  const [sessionDiffs, setSessionDiffs] = useState<Record<string, TemplateDiff>>({});
  const [showDiff, setShowDiff] = useState(false);

  // ─────────────────────────── import popup ───────────────────────────
  const [showPopupImport, setShowPopupImport] = useState(false);
  const handleOpenImport = () => setShowPopupImport(true);
  const handleCloseImport = () => setShowPopupImport(false);

  // Template assign modal (create/modify)
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignInterventionId, setAssignInterventionId] = useState<string | null>(null);
  const [assignInterventionTitle, setAssignInterventionTitle] = useState<string | undefined>(
    undefined
  );
  const [assignMode, setAssignMode] = useState<'create' | 'modify'>('create');

  // ─────────────────────────── Filters (library tab) ───────────────────────────
  const [libraryFilters, setLibraryFilters] = useState<LibraryFiltersState>(defaultLibraryFilters);

  // ─────────────────────────── Filters (templates → Browse All) ───────────────────────────
  const [templatesFilters, setTemplatesFilters] =
    useState<TemplatesFiltersState>(defaultTemplatesFilters);

  // ─────────────────────────── computed data ───────────────────────────
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);

  const diagnoses = useMemo(
    () =>
      (authStore.specialisations || []).flatMap(
        (spec) => config?.patientInfo?.function?.[spec]?.diagnosis || []
      ),
    [authStore.specialisations]
  );

  // Template list filtered by the search box
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templateStore.templates;
    return templateStore.templates.filter(
      (tmpl) =>
        tmpl.name.toLowerCase().includes(q) || (tmpl.description || '').toLowerCase().includes(q)
    );
  }, [templateStore.templates, templateSearch]);

  // Public templates updated since last viewed (not owned by current therapist)
  const unseenTemplates = useMemo(() => {
    return templateStore.templates.filter((tmpl) => {
      if (tmpl.created_by === authStore.id) return false;
      const seen = seenMap[tmpl.id];
      return !seen || tmpl.updatedAt > seen.updatedAt;
    });
  }, [templateStore.templates, seenMap, authStore.id]);

  // Store-driven interventions
  const recommendations = therapistInterventionsLibraryStore.items;

  // translated titles (page-local cache)
  type TitleMap = Record<string, { title: string; lang: string | null }>;
  const [translatedTitles, setTranslatedTitles] = useState<TitleMap>({});

  const filteredInterventions = useMemo(() => {
    return filterInterventions(recommendations, translatedTitles, {
      diagnosisFilter: libraryFilters.diagnosisFilter,
      languageFilter: libraryFilters.languageFilter,
      contentTypeFilter: libraryFilters.contentTypeFilter,
      tagFilter: libraryFilters.tagFilter,
      benefitForFilter: libraryFilters.aimsFilter,
      searchTerm: libraryFilters.searchTerm,
    });
  }, [recommendations, libraryFilters, translatedTitles]);

  const templateFilteredAll = useMemo(() => {
    return filterInterventions(recommendations, translatedTitles, {
      diagnosisFilter: templatesFilters.tDiagnosisFilter,
      languageFilter: templatesFilters.tLanguageFilter,
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
    async (diag?: string, horizon?: number, namedId?: string) => {
      try {
        setTLoading(true);
        const q = new URLSearchParams();
        if (diag) q.set('diagnosis', diag);

        let res: any;
        if (namedId) {
          q.set('horizon_days', String(horizon || 84));
          res = await apiClient.get<TemplatePayload>(
            `templates/${namedId}/calendar/?${q.toString()}`
          );
        } else {
          if (horizon) q.set('horizon', String(horizon));
          res = await apiClient.get<TemplatePayload>(
            `therapists/${authStore.id}/template-plan?${q.toString()}`
          );
        }
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
    if (mainTab === 'templates')
      fetchTemplates(templateDiag, templateHorizon, activeTemplateId || undefined);
  }, [mainTab, templateDiag, templateHorizon, activeTemplateId, fetchTemplates]);

  // Load named template list when entering templates tab
  useEffect(() => {
    if (mainTab === 'templates') {
      templateStore.fetchTemplates();
    }
  }, [mainTab]);

  // When template items load: compute intervention diff vs stored snapshot, then save updated snapshot
  useEffect(() => {
    if (!activeTemplateId || !templateItems.length) return;
    const tmpl = templateStore.templates.find((x) => x.id === activeTemplateId);
    if (!tmpl || tmpl.created_by === authStore.id) return;

    const oldInterventions = seenMapRef.current[activeTemplateId]?.interventions ?? [];

    const currentInterventions: InterventionRef[] = templateItems.map((it) => {
      const seg = getSegments(it)[0];
      return {
        id: it.intervention._id,
        title: it.intervention.title,
        diagnosis: it.diagnosis,
        start_day: seg.start_day,
        end_day: seg.end_day ?? null,
        unit: seg.unit,
        interval: seg.interval,
        selectedDays: seg.selectedDays,
      };
    });

    if (oldInterventions.length > 0) {
      // Key = id + diagnosis (same intervention may appear under multiple diagnoses)
      const key = (i: InterventionRef) => `${i.id}::${i.diagnosis}`;
      const oldMap = new Map(oldInterventions.map((i) => [key(i), i]));
      const newMap = new Map(currentInterventions.map((i) => [key(i), i]));

      const added = currentInterventions.filter((i) => !oldMap.has(key(i)));
      const removed = oldInterventions.filter((i) => !newMap.has(key(i)));
      const modified: ModifiedRef[] = currentInterventions
        .filter((curr) => {
          const prev = oldMap.get(key(curr));
          if (!prev) return false;
          return (
            curr.start_day !== prev.start_day ||
            curr.end_day !== prev.end_day ||
            curr.unit !== prev.unit ||
            curr.interval !== prev.interval ||
            JSON.stringify([...curr.selectedDays].sort()) !==
              JSON.stringify([...prev.selectedDays].sort())
          );
        })
        .map((curr) => ({ prev: oldMap.get(key(curr))!, curr }));

      if (added.length > 0 || removed.length > 0 || modified.length > 0) {
        setSessionDiffs((prev) => ({
          ...prev,
          [activeTemplateId]: {
            ...(prev[activeTemplateId] ?? { date: tmpl.updatedAt, metaChanges: [] }),
            added,
            removed,
            modified,
          },
        }));
      }
    }

    // Save updated snapshot with current intervention list
    setSeenMap((prev) => {
      const snap: TemplateSeen = {
        ...(prev[activeTemplateId] ?? {
          updatedAt: tmpl.updatedAt,
          name: tmpl.name,
          description: tmpl.description || '',
          intervention_count: tmpl.intervention_count,
        }),
        interventions: currentInterventions,
      };
      const updated = { ...prev, [activeTemplateId]: snap };
      localStorage.setItem('templateSeenMap', JSON.stringify(updated));
      return updated;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateItems, activeTemplateId]);

  const openAssignToTemplate = (
    id: string,
    title?: string,
    mode: 'create' | 'modify' = 'create'
  ) => {
    setAssignMode(mode);
    setAssignInterventionId(id);
    setAssignInterventionTitle(title);
    setAssignOpen(true);
  };

  const openModifyTemplate = (it: TemplateItem) => {
    setAssignMode('modify');
    setAssignInterventionId(it.intervention._id);
    setAssignInterventionTitle(
      translatedTitles[it.intervention._id]?.title ?? it.intervention.title
    );
    setTemplateDiag(it.diagnosis);
    setAssignOpen(true);
  };

  const removeTemplateItem = async (
    diagnosis: string,
    interventionId: string,
    startDay?: number
  ) => {
    try {
      if (activeTemplateId) {
        const q = diagnosis ? `?diagnosis=${encodeURIComponent(diagnosis)}` : '';
        await apiClient.delete(
          `templates/${activeTemplateId}/interventions/${interventionId}/${q}`
        );
      } else {
        const payload: any = { intervention_id: interventionId, diagnosis };
        if (typeof startDay === 'number') payload.start_day = startDay;
        await apiClient.post(
          `therapists/${authStore.id}/interventions/remove-from-patient-types/`,
          payload
        );
      }

      fetchTemplates(templateDiag, templateHorizon, activeTemplateId || undefined);
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

  // ─────────────────────────── named template actions ───────────────────────────
  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      setNewTemplateSubmitting(true);
      const tmpl = await templateStore.createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim(),
        is_public: newTemplatePublic,
      });
      setActiveTemplateId(tmpl.id);
      setShowNewTemplateModal(false);
      setNewTemplateName('');
      setNewTemplateDesc('');
      setNewTemplatePublic(false);
    } catch {
      // error shown via templateStore.error
    } finally {
      setNewTemplateSubmitting(false);
    }
  };

  const handleDeleteActiveTemplate = async () => {
    if (!activeTemplateId) return;
    if (!window.confirm(t('Delete this template? This cannot be undone.'))) return;
    await templateStore.deleteTemplate(activeTemplateId);
    setActiveTemplateId('');
    setTemplateItems([]);
  };

  const handleCopyActiveTemplate = () => {
    if (!activeTemplateId) return;
    const tmpl = templateStore.templates.find((x) => x.id === activeTemplateId);
    if (!tmpl) return;
    setCopyModalName(`${t('Copy of')} ${tmpl.name}`);
    setCopyModalDesc(tmpl.description || '');
    setShowCopyModal(true);
  };

  const handleConfirmCopy = async () => {
    if (!activeTemplateId) return;
    try {
      setCopyModalSubmitting(true);
      const copy = await templateStore.copyTemplate(
        activeTemplateId,
        copyModalName.trim(),
        copyModalDesc.trim()
      );
      setActiveTemplateId(copy.id);
      setShowCopyModal(false);
    } catch {
      // error surfaced via templateStore.error
    } finally {
      setCopyModalSubmitting(false);
    }
  };

  const handleOpenEditMeta = () => {
    const tmpl = templateStore.templates.find((x) => x.id === activeTemplateId);
    if (!tmpl) return;
    setEditMetaName(tmpl.name);
    setEditMetaDesc(tmpl.description || '');
    setEditMetaPublic(tmpl.is_public);
    setShowEditMetaModal(true);
  };

  const handleConfirmEditMeta = async () => {
    if (!activeTemplateId) return;
    try {
      setEditMetaSubmitting(true);
      await templateStore.updateTemplate(activeTemplateId, {
        name: editMetaName.trim(),
        description: editMetaDesc.trim(),
        is_public: editMetaPublic,
      });
      setShowEditMetaModal(false);
    } catch {
      // error surfaced via templateStore.error
    } finally {
      setEditMetaSubmitting(false);
    }
  };

  const handleTemplateSelect = (id: string) => {
    setShowDiff(false);
    setTemplateSearch('');
    setActiveTemplateId(id);
    if (!id) return;
    const tmpl = templateStore.templates.find((x) => x.id === id);
    if (!tmpl) return;

    const oldSnap = seenMapRef.current[id];
    const isUpdated = oldSnap && tmpl.updatedAt > oldSnap.updatedAt;

    // Compute meta-only diff immediately; intervention diff arrives when items load
    if (isUpdated) {
      const metaChanges: string[] = [];
      if (tmpl.name !== oldSnap.name) metaChanges.push(t('Name changed'));
      if ((tmpl.description || '') !== (oldSnap.description || ''))
        metaChanges.push(t('Description changed'));
      setSessionDiffs((prev) => ({
        ...prev,
        [id]: { date: tmpl.updatedAt, metaChanges, added: [], removed: [] },
      }));
    }

    // Save snapshot — carry forward old intervention list until items load
    const snap: TemplateSeen = {
      updatedAt: tmpl.updatedAt,
      name: tmpl.name,
      description: tmpl.description || '',
      intervention_count: tmpl.intervention_count,
      interventions: oldSnap?.interventions ?? [],
    };
    const updated = { ...seenMapRef.current, [id]: snap };
    setSeenMap(updated);
    localStorage.setItem('templateSeenMap', JSON.stringify(updated));
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
    <Layout>
      <WelcomeArea user="TherapistPatients" />

      <Container className="main-content mt-4">
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
          <>
            {/* ── Named template management bar ── */}
            <Card className="mb-3">
              <Card.Body>
                {/* ── Row 1: search + selector + actions ── */}
                <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
                  {/* ── Template autocomplete search ── */}
                  <div className="position-relative" style={{ minWidth: 240 }}>
                    <Form.Control
                      size="sm"
                      placeholder={t('Search templates...')}
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      onFocus={() => templateSearch && setTemplateSearch(templateSearch)}
                      autoComplete="off"
                    />
                    {templateSearch.trim() && (
                      <div
                        className="position-absolute bg-white border rounded shadow-sm mt-1 w-100"
                        style={{ zIndex: 1050, maxHeight: 260, overflowY: 'auto' }}
                      >
                        {filteredTemplates.length === 0 ? (
                          <div className="px-3 py-2 text-muted small">{t('No data available')}</div>
                        ) : (
                          filteredTemplates.map((tmpl) => {
                            const isUnseen = unseenTemplates.some((u) => u.id === tmpl.id);
                            const q = templateSearch.trim();
                            const highlight = (text: string) => {
                              const idx = text.toLowerCase().indexOf(q.toLowerCase());
                              if (idx === -1) return <>{text}</>;
                              return (
                                <>
                                  {text.slice(0, idx)}
                                  <mark className="p-0 bg-warning bg-opacity-50">
                                    {text.slice(idx, idx + q.length)}
                                  </mark>
                                  {text.slice(idx + q.length)}
                                </>
                              );
                            };
                            return (
                              <div
                                key={tmpl.id}
                                className={`px-3 py-2 border-bottom ${activeTemplateId === tmpl.id ? 'bg-primary bg-opacity-10' : ''}`}
                                style={{ cursor: 'pointer' }}
                                onMouseDown={(e) => {
                                  e.preventDefault(); // keep focus on input during click
                                  handleTemplateSelect(tmpl.id);
                                  setTemplateSearch('');
                                }}
                              >
                                <div className="d-flex align-items-center gap-1">
                                  {isUnseen && (
                                    <FaBell
                                      className="text-warning"
                                      style={{ fontSize: '0.7rem' }}
                                    />
                                  )}
                                  <span className="fw-semibold small">{highlight(tmpl.name)}</span>
                                  {tmpl.is_public && (
                                    <span
                                      className="badge bg-secondary ms-1"
                                      style={{ fontSize: '0.65rem' }}
                                    >
                                      {t('public')}
                                    </span>
                                  )}
                                  {tmpl.created_by !== authStore.id && (
                                    <span className="text-muted small ms-1">
                                      — {tmpl.created_by_name}
                                    </span>
                                  )}
                                </div>
                                {tmpl.description && (
                                  <div className="text-muted small text-truncate">
                                    {highlight(tmpl.description)}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Full template selector (for browsing without search) ── */}
                  <div className="position-relative">
                    <Form.Select
                      size="sm"
                      style={{ maxWidth: 280 }}
                      value={activeTemplateId}
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                    >
                      <option value="">{t('Implicit therapist template')}</option>
                      {templateStore.templates.map((tmpl) => {
                        const isUnseen = unseenTemplates.some((u) => u.id === tmpl.id);
                        return (
                          <option key={tmpl.id} value={tmpl.id}>
                            {isUnseen ? '● ' : ''}
                            {tmpl.name}
                            {tmpl.is_public ? ` (${t('public')})` : ''}
                            {tmpl.created_by !== authStore.id ? ` — ${tmpl.created_by_name}` : ''}
                          </option>
                        );
                      })}
                    </Form.Select>
                    {unseenTemplates.length > 0 && (
                      <span
                        className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark"
                        style={{ fontSize: '0.65rem', cursor: 'default' }}
                        title={t('{{count}} template(s) updated since last view', {
                          count: unseenTemplates.length,
                        })}
                      >
                        <FaBell className="me-1" />
                        {unseenTemplates.length}
                      </span>
                    )}
                  </div>

                  {templateStore.loading && <Spinner size="sm" />}

                  <Button
                    size="sm"
                    variant="outline-success"
                    onClick={() => setShowNewTemplateModal(true)}
                  >
                    <FaPlus className="me-1" />
                    {t('New')}
                  </Button>

                  {activeTemplateId && (
                    <ButtonGroup size="sm">
                      <Button
                        variant="outline-primary"
                        onClick={() => setShowApplyModal(true)}
                        title={t('Apply to patient')}
                      >
                        <FaUpload className="me-1" />
                        {t('Apply')}
                      </Button>
                      {templateStore.templates.find((x) => x.id === activeTemplateId)
                        ?.created_by === authStore.id && (
                        <Button
                          variant="outline-secondary"
                          onClick={handleOpenEditMeta}
                          title={t('Edit name / description')}
                        >
                          <FaEdit />
                        </Button>
                      )}
                      <Button
                        variant="outline-secondary"
                        onClick={handleCopyActiveTemplate}
                        title={t('Copy template')}
                      >
                        <FaCopy />
                      </Button>
                      {templateStore.templates.find((x) => x.id === activeTemplateId)
                        ?.created_by === authStore.id && (
                        <Button
                          variant="outline-danger"
                          onClick={handleDeleteActiveTemplate}
                          title={t('Delete template')}
                        >
                          <FaTrash />
                        </Button>
                      )}
                    </ButtonGroup>
                  )}
                </div>

                {/* ── Row 2: view options (diagnosis + horizon) ── */}
                <div className="d-flex align-items-center flex-wrap gap-3 mb-2">
                  <div className="d-flex align-items-center gap-1">
                    <small className="text-muted">{t('Diagnosis_patient_list')}:</small>
                    <Form.Select
                      size="sm"
                      style={{ maxWidth: 200 }}
                      value={templateDiag}
                      onChange={(e) => setTemplateDiag(e.target.value)}
                    >
                      <option value="">{t('All')}</option>
                      {diagnoses.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </Form.Select>
                  </div>
                  <div className="d-flex align-items-center gap-1">
                    <small className="text-muted">{t('Horizon (days)')}:</small>
                    <Form.Control
                      size="sm"
                      type="number"
                      min={14}
                      max={180}
                      style={{ maxWidth: 80 }}
                      value={templateHorizon}
                      onChange={(e) => setTemplateHorizon(parseInt(e.target.value || '84', 10))}
                    />
                  </div>
                </div>

                {activeTemplateId &&
                  (() => {
                    const tmpl = templateStore.templates.find((x) => x.id === activeTemplateId);
                    if (!tmpl) return null;
                    const diff = sessionDiffs[activeTemplateId];
                    return (
                      <div className="d-flex flex-column ms-2" style={{ maxWidth: 480 }}>
                        {tmpl.description && (
                          <small className="text-muted">{tmpl.description}</small>
                        )}
                        {diff &&
                          (() => {
                            const scheduleLabel = (i: InterventionRef) => {
                              const end = i.end_day != null ? ` → ${t('day')} ${i.end_day}` : '';
                              const days = i.selectedDays.length
                                ? ` (${i.selectedDays.join(', ')})`
                                : '';
                              return `${t('day')} ${i.start_day}${end}, ${t('every')} ${i.interval} ${t(i.unit)}${days}`;
                            };
                            const scheduleChanges = (m: ModifiedRef) => {
                              const parts: string[] = [];
                              if (m.curr.start_day !== m.prev.start_day)
                                parts.push(
                                  `${t('start day')} ${m.prev.start_day} → ${m.curr.start_day}`
                                );
                              if (m.curr.end_day !== m.prev.end_day)
                                parts.push(
                                  `${t('end day')} ${m.prev.end_day ?? '∞'} → ${m.curr.end_day ?? '∞'}`
                                );
                              if (
                                m.curr.unit !== m.prev.unit ||
                                m.curr.interval !== m.prev.interval
                              )
                                parts.push(
                                  `${t('frequency')}: ${m.prev.interval} ${t(m.prev.unit)} → ${m.curr.interval} ${t(m.curr.unit)}`
                                );
                              if (
                                JSON.stringify([...m.curr.selectedDays].sort()) !==
                                JSON.stringify([...m.prev.selectedDays].sort())
                              )
                                parts.push(
                                  `${t('days')}: ${m.prev.selectedDays.join(', ') || '—'} → ${m.curr.selectedDays.join(', ') || '—'}`
                                );
                              return parts.join('; ');
                            };
                            const totalChanges =
                              diff.metaChanges.length +
                              diff.added.length +
                              diff.removed.length +
                              diff.modified.length;
                            return (
                              <div className="mt-1">
                                <button
                                  className="btn btn-sm btn-warning d-flex align-items-center gap-1 py-0 px-2"
                                  onClick={() => setShowDiff((v) => !v)}
                                >
                                  <FaBell />
                                  <small>
                                    {t('Updated')}: {new Date(diff.date).toLocaleDateString()} (
                                    {totalChanges})
                                  </small>
                                  <small>{showDiff ? '▲' : '▼'}</small>
                                </button>
                                {showDiff && (
                                  <div className="mt-1 p-2 rounded border border-warning bg-warning bg-opacity-10">
                                    {diff.metaChanges.map((c) => (
                                      <small key={c} className="text-muted d-block">
                                        • {c}
                                      </small>
                                    ))}
                                    {diff.added.map((i) => (
                                      <small
                                        key={`${i.id}::${i.diagnosis}`}
                                        className="text-success d-block"
                                      >
                                        + {translatedTitles[i.id]?.title ?? i.title}
                                        {i.diagnosis && (
                                          <span className="text-muted"> [{i.diagnosis}]</span>
                                        )}
                                        <span className="text-muted"> — {scheduleLabel(i)}</span>
                                      </small>
                                    ))}
                                    {diff.removed.map((i) => (
                                      <small
                                        key={`${i.id}::${i.diagnosis}`}
                                        className="text-danger d-block"
                                      >
                                        − {translatedTitles[i.id]?.title ?? i.title}
                                        {i.diagnosis && (
                                          <span className="text-muted"> [{i.diagnosis}]</span>
                                        )}
                                      </small>
                                    ))}
                                    {diff.modified.map(({ prev, curr }) => (
                                      <small
                                        key={`${curr.id}::${curr.diagnosis}`}
                                        className="text-warning-emphasis d-block"
                                      >
                                        ~ {translatedTitles[curr.id]?.title ?? curr.title}
                                        {curr.diagnosis && (
                                          <span className="text-muted"> [{curr.diagnosis}]</span>
                                        )}
                                        <span className="text-muted">
                                          {' '}
                                          — {scheduleChanges({ prev, curr })}
                                        </span>
                                      </small>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })()}
              </Card.Body>
            </Card>

            <TemplatesLayout
              t={t}
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
          </>
        )}
      </Container>

      {/* Apply named template to patient */}
      <ApplyTemplateModal
        show={showApplyModal}
        onHide={() => setShowApplyModal(false)}
        diagnoses={diagnoses}
        defaultDiagnosis={templateDiag || undefined}
        templateId={activeTemplateId || undefined}
        onApplied={(res) => {
          setShowApplyModal(false);
          setError('');
          window.alert(
            t('Template applied: {{applied}} interventions, {{sessions}} sessions', {
              applied: res.applied,
              sessions: res.sessions_created,
            })
          );
        }}
      />

      {/* New template modal */}
      <Modal show={showNewTemplateModal} onHide={() => setShowNewTemplateModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Create new template')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>{t('Name')}</Form.Label>
            <Form.Control
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder={t('Template name')}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t('Description (optional)')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={newTemplateDesc}
              onChange={(e) => setNewTemplateDesc(e.target.value)}
            />
          </Form.Group>
          <Form.Check
            type="checkbox"
            label={t('Public (visible to all therapists)')}
            checked={newTemplatePublic}
            onChange={(e) => setNewTemplatePublic(e.target.checked)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNewTemplateModal(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateTemplate}
            disabled={!newTemplateName.trim() || newTemplateSubmitting}
          >
            {newTemplateSubmitting ? t('Creating...') : t('Create')}
          </Button>
        </Modal.Footer>
      </Modal>

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
          interventionTitle={assignInterventionTitle}
          diagnoses={diagnoses}
          defaultDiagnosis={templateDiag || undefined}
          mode={assignMode}
          templateId={activeTemplateId || undefined}
          onSuccess={() =>
            fetchTemplates(templateDiag, templateHorizon, activeTemplateId || undefined)
          }
        />
      )}

      {/* Copy template modal */}
      <Modal show={showCopyModal} onHide={() => setShowCopyModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Copy template')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>{t('Name')}</Form.Label>
            <Form.Control
              value={copyModalName}
              onChange={(e) => setCopyModalName(e.target.value)}
              placeholder={t('Template name')}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label>{t('Description (optional)')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={copyModalDesc}
              onChange={(e) => setCopyModalDesc(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowCopyModal(false)}
            disabled={copyModalSubmitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmCopy}
            disabled={!copyModalName.trim() || copyModalSubmitting}
          >
            {copyModalSubmitting ? t('Copying...') : t('Copy')}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit template name / description / visibility modal */}
      <Modal show={showEditMetaModal} onHide={() => setShowEditMetaModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Edit template info')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>{t('Name')}</Form.Label>
            <Form.Control
              value={editMetaName}
              onChange={(e) => setEditMetaName(e.target.value)}
              placeholder={t('Template name')}
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>{t('Description (optional)')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              value={editMetaDesc}
              onChange={(e) => setEditMetaDesc(e.target.value)}
            />
          </Form.Group>
          <Form.Check
            type="checkbox"
            id="edit-meta-public"
            label={t('Public (visible to all therapists)')}
            checked={editMetaPublic}
            onChange={(e) => setEditMetaPublic(e.target.checked)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowEditMetaModal(false)}
            disabled={editMetaSubmitting}
          >
            {t('Cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmEditMeta}
            disabled={!editMetaName.trim() || editMetaSubmitting}
          >
            {editMetaSubmitting ? t('Saving...') : t('Save')}
          </Button>
        </Modal.Footer>
      </Modal>
    </Layout>
  );
});

export default TherapistRecomendations;
