import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Nav, OverlayTrigger, Tab, Tooltip } from 'react-bootstrap';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FaLock } from 'react-icons/fa';

import Layout from '@/components/Layout';
import Section from '@/components/Section';
import ErrorAlert from '@/components/common/ErrorAlert';
import { PlayableMedia } from '@/components/common/PlayableMedia';
import { Skeleton } from '@/components/ui/skeleton';
import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { patientInterventionsLibraryStore } from '@/stores/interventionsLibraryStore';
import { useRoleAuthGate } from '@/hooks/useRoleAuthGate';
import { translateText } from '@/utils/translate';
import { isHttpUrl, matchesHost } from '@/utils/urlUtils';

import ArrowLeftIcon from '@/assets/icons/arrow-left-fill.svg?react';
import CircleHalfCheckIcon from '@/assets/icons/circle-half-dotted-check-fill.svg?react';
import CircleCheckFillIcon from '@/assets/icons/circle-check-fill.svg?react';
import ClockIcon from '@/assets/icons/interventions/clock.svg?react';
import MediaIcon from '@/assets/icons/interventions/video.svg?react';
import ReaderIcon from '@/assets/icons/interventions/website.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';
import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import OpenExternalIcon from '@/assets/icons/open-external-fill.svg?react';
import CalendarIcon from '@/assets/icons/calendar-outline.svg?react';
import FeedbackPopup from '@/components/PatientPage/FeedbackPopup';
import RescheduleInterventionSheet from '@/components/PatientPage/RescheduleInterventionSheet';
import Card from '@/components/Card';

type InterventionMedia = {
  kind: 'external' | 'file';
  media_type: 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
  provider?: string | null;
  title?: string | null;
  url?: string | null;
  embed_url?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  mime?: string | null;
  thumbnail?: string | null;
  media_slot?: number | null;
};

type NormalizedMedia = Omit<InterventionMedia, 'kind'> & {
  kind: string;
};

const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const norm = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const lower = (v: unknown) => norm(v).toLowerCase();

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

const asArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (!v) return [];
  if (typeof v === 'object') return [v as T];
  return [];
};

const isSpotify = (u: string) => matchesHost(u, 'spotify.com');
const isYouTube = (u: string) => matchesHost(u, 'youtube.com', 'youtu.be');
const isVimeo = (u: string) => matchesHost(u, 'vimeo.com');
const isSoundCloud = (u: string) => matchesHost(u, 'soundcloud.com');

const guessMediaTypeFromUrl = (u: string): InterventionMedia['media_type'] => {
  const url = lower(u);
  if (isSpotify(url)) return 'streaming';
  if (isYouTube(url) || isVimeo(url)) return 'video';
  if (isSoundCloud(url)) return 'audio';
  if (url.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/)) return 'audio';
  if (url.match(/\.(mp4|mov|m4v|webm)(\?|$)/)) return 'video';
  if (url.match(/\.(pdf)(\?|$)/)) return 'pdf';
  if (url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'image';
  return 'website';
};

const guessProvider = (u: string) => {
  const url = lower(u);
  if (isSpotify(url)) return 'spotify';
  if (isYouTube(url)) return 'youtube';
  if (isSoundCloud(url)) return 'soundcloud';
  if (isVimeo(url)) return 'vimeo';
  return 'website';
};

const guessMediaTypeFromFilePath = (p: string): InterventionMedia['media_type'] => {
  const path = lower(p);
  if (path.match(/\.(mp3|wav|m4a|ogg|webm)$/)) return 'audio';
  if (path.match(/\.(mp4|mov|m4v|webm)$/)) return 'video';
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'image';
  return 'text';
};

const getAllMedia = (item: any): InterventionMedia[] => {
  const rawMedia = asArray<Record<string, unknown>>(item?.media);

  if (rawMedia.length) {
    return rawMedia
      .map((m): NormalizedMedia => {
        const rawMediaType = asStr(m.media_type) || asStr(m.mediaType) || 'website';

        const slotRaw = m.media_slot;
        const mediaSlot = typeof slotRaw === 'number' ? slotRaw : null;

        return {
          kind: asStr(m.kind),
          media_type: rawMediaType as InterventionMedia['media_type'],
          provider: asStr(m.provider) || null,
          title: asStr(m.title) || null,
          url: asStr(m.url) || null,
          embed_url: asStr(m.embed_url) || asStr(m.embedUrl) || null,
          file_path: asStr(m.file_path) || asStr(m.filePath) || null,
          file_url: asStr(m.file_url) || asStr(m.fileUrl) || null,
          mime: asStr(m.mime) || null,
          thumbnail: asStr(m.thumbnail) || null,
          media_slot: mediaSlot,
        };
      })
      .filter(
        (media): media is InterventionMedia => media.kind === 'external' || media.kind === 'file'
      )
      .sort((a, b) => (a.media_slot ?? 1) - (b.media_slot ?? 1));
  }

  // legacy fallback
  const out: InterventionMedia[] = [];
  const link = norm(item?.link);
  const mf = norm(item?.media_file || item?.media_url || item?.media);

  if (link && isHttpUrl(link)) {
    out.push({
      kind: 'external',
      media_type: guessMediaTypeFromUrl(link),
      provider: guessProvider(link),
      url: link,
      title: item?.title ?? null,
      embed_url: null,
      file_path: null,
      file_url: null,
      mime: null,
      thumbnail: null,
    });
  }

  if (mf) {
    if (isHttpUrl(mf)) {
      out.push({
        kind: 'external',
        media_type: guessMediaTypeFromUrl(mf),
        provider: guessProvider(mf),
        url: mf,
        title: item?.title ?? null,
        embed_url: null,
        file_path: null,
        file_url: null,
        mime: null,
        thumbnail: null,
      });
    } else {
      out.push({
        kind: 'file',
        media_type: guessMediaTypeFromFilePath(mf),
        file_path: mf,
        title: item?.title ?? null,
        provider: null,
        url: null,
        embed_url: null,
        file_url: null,
        mime: null,
        thumbnail: null,
      });
    }
  }

  return out;
};

const getPlayableUrl = (m: InterventionMedia): string => {
  if (m.media_type === 'streaming' && lower(m.provider) === 'spotify' && m.embed_url) {
    return m.embed_url;
  }
  if (m.kind === 'external') return norm(m.url || '');
  if (m.kind === 'file') return norm(m.file_url || m.file_path || '');
  return '';
};

const getOpenLinkUrl = (m: InterventionMedia): string => {
  const candidate = norm(m.url || m.embed_url || m.file_url || m.file_path || '');
  return isHttpUrl(candidate) ? candidate : '';
};

const getMediaBadge = (media: InterventionMedia[]) => {
  if (!media.length) return { label: 'No media', icon: '' as const };
  const types = new Set(media.map((m) => m.media_type));
  if (types.size > 1) return { label: 'Mixed', icon: '' as const };

  const only = [...types][0];
  switch (only) {
    case 'video':
      return { label: 'Video', icon: 'media' as const };
    case 'audio':
    case 'streaming':
      return { label: 'Audio', icon: 'media' as const };
    case 'pdf':
      return { label: 'PDF', icon: 'reader' as const };
    case 'image':
      return { label: 'Image', icon: 'media' as const };
    case 'app':
      return { label: 'App', icon: 'reader' as const };
    default:
      return { label: 'Link', icon: 'reader' as const };
  }
};

const OneMedia: React.FC<{ m: InterventionMedia; idx: number }> = ({ m, idx }) => {
  const { t } = useTranslation();
  const label = m.title || `${t('Media')} ${idx + 1}`;
  const playable = getPlayableUrl(m);

  return (
    <div>
      {m.media_type === 'pdf' ? (
        <div className="flex">
          {isHttpUrl(playable) && (
            <iframe
              src={playable}
              title={label}
              className="border-0 aspect-[5/7] w-full max-w-96 mx-auto"
            >
              <p>{t('Failed to load media, use the link below to open it in a new tab.')}</p>
            </iframe>
          )}
        </div>
      ) : m.media_type === 'image' ? (
        <img src={playable} alt={label} className="w-full object-contain rounded-3xl" />
      ) : (
        <PlayableMedia
          m={{
            kind: m.kind,
            media_type: m.media_type,
            url: m.url,
            embed_url: m.embed_url,
            file_path: m.file_path,
            file_url: m.file_url,
            title: m.title,
            provider: m.provider,
          }}
          label={label}
          openText={t('Open link')}
          showOpenLink={false}
        />
      )}
    </div>
  );
};

const MediaContent: React.FC<{ mediaList: InterventionMedia[] }> = ({ mediaList }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('media-0');

  const renderableMedia = mediaList.filter((m) =>
    ['video', 'audio', 'streaming', 'pdf', 'image'].includes(m.media_type)
  );

  if (!renderableMedia.length) return null;

  if (renderableMedia.length === 1) {
    return <OneMedia m={renderableMedia[0]} idx={0} />;
  }

  return (
    <Tab.Container activeKey={activeTab} onSelect={(k) => setActiveTab(k ?? 'media-0')}>
      <Nav variant="tabs" className="mb-3 flex-wrap">
        {renderableMedia.map((m, idx) => (
          <Nav.Item key={idx}>
            <Nav.Link eventKey={`media-${idx}`}>{m.title || `${t('Media')} ${idx + 1}`}</Nav.Link>
          </Nav.Item>
        ))}
      </Nav>
      <Tab.Content>
        {renderableMedia.map((m, idx) => (
          <Tab.Pane key={idx} eventKey={`media-${idx}`}>
            <OneMedia m={m} idx={idx} />
          </Tab.Pane>
        ))}
      </Tab.Content>
    </Tab.Container>
  );
};

const PatientInterventionDetail: React.FC = observer(() => {
  const navigate = useNavigate();
  const { interventionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const patientId = authStore.getStoredUserId();
  const viewOpenedAt = useRef<number>(Date.now());
  const mediaRef = useRef<HTMLDivElement>(null);
  const tooltipContainerRef = useRef<HTMLDivElement>(null);

  const { isAllowed } = useRoleAuthGate('Patient');

  useEffect(() => {
    if (!isAllowed) return;

    let alive = true;

    const run = async () => {
      if (!patientId) {
        setError(String(t('Patient not found.')));
        setLoading(false);
        return;
      }

      if (!patientInterventionsStore.items.length) {
        await patientInterventionsStore.fetchPlan(patientId, i18n.language);
      }

      if (!patientInterventionsLibraryStore.visibleItemsForPatient.length) {
        const lang = (authStore.preferredLanguage || i18n.language || 'en').slice(0, 2);
        await patientInterventionsLibraryStore.fetchAll({ mode: 'patient', lang });
      }

      if (!alive) return;
      setLoading(false);
    };

    run();

    return () => {
      alive = false;
    };
  }, [isAllowed, patientId, i18n.language, t]);

  const selectedRec = useMemo<PatientRec | null>(() => {
    return (
      patientInterventionsStore.items.find(
        (rec) =>
          rec.intervention_id === interventionId ||
          asStr(rec.intervention?._id) === interventionId ||
          asStr(rec.intervention?.external_id) === interventionId
      ) || null
    );
  }, [interventionId, patientInterventionsStore.items]);

  const selectedLibraryItem = useMemo<unknown | null>(() => {
    const items = patientInterventionsLibraryStore.visibleItemsForPatient as unknown[];
    return (
      items.find(
        (it) =>
          asStr(asRecord(it)._id) === interventionId ||
          asStr(asRecord(it).id) === interventionId ||
          asStr(asRecord(it).external_id) === interventionId
      ) || null
    );
  }, [interventionId, patientInterventionsLibraryStore.visibleItemsForPatient]);

  const { targetDate, targetOccurrenceIso } = useMemo(() => {
    const none = { targetDate: null as Date | null, targetOccurrenceIso: null as string | null };

    const dateParam = searchParams.get('date');
    if (!dateParam || !selectedRec?.dates?.length) return none;

    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return none;

    const dateKey = format(parsed, 'yyyy-MM-dd');
    const matchedIso = selectedRec.dates.find((d) => format(new Date(d), 'yyyy-MM-dd') === dateKey);

    return matchedIso ? { targetDate: parsed, targetOccurrenceIso: matchedIso } : none;
  }, [searchParams, selectedRec]);

  const targetOccurrenceDate = useMemo(
    () => (targetOccurrenceIso ? new Date(targetOccurrenceIso) : null),
    [targetOccurrenceIso]
  );

  const [showRescheduleSheet, setShowRescheduleSheet] = useState(false);

  const completed =
    selectedRec && targetDate
      ? patientInterventionsStore.isCompletedOn(selectedRec, targetDate)
      : false;

  const completionDateKey = useMemo(
    () => (targetDate ? format(targetDate, 'yyyy-MM-dd') : ''),
    [targetDate]
  );
  const completionLockKey = selectedRec
    ? `${selectedRec.intervention_id}__${completionDateKey}`
    : '__missing__';
  const isBusy = busyKey === completionLockKey;

  const handleToggleCompleted = async () => {
    if (!patientId || !selectedRec || !targetDate) return;
    if (isBusy) return;

    setBusyKey(completionLockKey);

    try {
      const res = await patientInterventionsStore.toggleCompleted(
        patientId,
        selectedRec,
        targetDate
      );

      if (res?.completed) {
        try {
          await patientQuestionnairesStore.openInterventionFeedback(
            patientId,
            selectedRec.intervention_id,
            res.dateKey,
            i18n.language
          );
        } catch (feedbackErr) {
          console.error('[openFeedbackFor] failed:', feedbackErr);
          try {
            patientQuestionnairesStore.closeFeedback();
          } catch {
            // Ignore close errors
          }
        }
      }
    } catch (err) {
      console.error('Toggle completed failed:', err);
    } finally {
      setBusyKey(null);
    }
  };

  const handleRescheduleSubmit = async (newDate: Date) => {
    if (!patientId || !selectedRec || !targetOccurrenceIso) return;

    const newIso = await patientInterventionsStore.rescheduleOccurrence(
      patientId,
      selectedRec,
      targetOccurrenceIso,
      newDate
    );

    navigate(
      `/patient-intervention/${interventionId}?date=${format(new Date(newIso), 'yyyy-MM-dd')}`,
      {
        replace: true,
      }
    );
  };

  // Safe questions array for feedback questionnaire
  const safeInterventionQuestions = Array.isArray(patientQuestionnairesStore.feedbackQuestions)
    ? patientQuestionnairesStore.feedbackQuestions
    : [];

  const effectiveItem = useMemo<any | null>(() => {
    if (selectedRec) {
      const intervention = asRecord(selectedRec.intervention || {});
      return {
        title: selectedRec.intervention_title || asStr(intervention.title) || '',
        intervention_title: selectedRec.intervention_title || asStr(intervention.title) || '',
        description: selectedRec.description || asStr(intervention.description) || '',
        content_type: asStr(intervention.content_type) || '',
        language: asStr(intervention.language) || '',
        external_id: asStr(intervention.external_id) || '',
        provider: asStr(intervention.provider) || '',
        media: asArray<unknown>(intervention.media).length
          ? asArray<unknown>(intervention.media)
          : (selectedRec.media as unknown[]) || [],
        available_languages: asArray<string>(intervention.available_languages),
        intervention,
        is_private: Boolean(intervention.is_private),
        link: asStr(intervention.link) || '',
        media_file: asStr(intervention.media_file) || '',
        media_url: asStr(intervention.media_url) || '',
        notes: asStr(selectedRec.notes) || '',
      };
    }

    if (selectedLibraryItem) {
      const intervention = asRecord(selectedLibraryItem);
      const aims = asArray<string>(intervention.aims);
      const benefitFor = asArray<string>(intervention.benefitFor);
      const primaryAim = asStr(intervention.aim) || aims[0] || benefitFor[0] || '';

      return {
        title: asStr(intervention.title) || '',
        intervention_title: asStr(intervention.title) || '',
        description: asStr(intervention.description) || '',
        content_type: asStr(intervention.content_type) || '',
        language: asStr(intervention.language) || '',
        external_id: asStr(intervention.external_id) || '',
        provider: asStr(intervention.provider) || '',
        media: asArray<unknown>(intervention.media),
        available_languages: asArray<string>(intervention.available_languages),
        intervention: {
          ...intervention,
          aim: primaryAim,
        },
        is_private: Boolean(intervention.is_private),
        link: asStr(intervention.link) || '',
        media_file: asStr(intervention.media_file) || '',
        media_url: asStr(intervention.media_url) || '',
        notes: asStr(intervention.notes) || '',
      };
    }

    return null;
  }, [selectedRec, selectedLibraryItem]);

  // Track time spent on this intervention detail page
  useEffect(() => {
    const openedAt = viewOpenedAt.current;
    return () => {
      const seconds = Math.round((Date.now() - openedAt) / 1000);
      if (seconds < 2 || !patientId || !interventionId) return;
      const date = searchParams.get('date') || '';
      apiClient
        .post(`/patients/vitals/intervention-view/${patientId}/`, {
          intervention_id: interventionId,
          date,
          seconds_viewed: seconds,
        })
        .catch(() => {
          /* best-effort, no noise */
        });
    };
  }, []);

  // keep translations in sync with effectiveItem
  useEffect(() => {
    if (!effectiveItem) return;

    let alive = true;

    const run = async () => {
      try {
        const desc = effectiveItem?.description || '';
        if (desc) {
          const { translatedText: tx, detectedSourceLanguage } = await translateText(desc);
          if (!alive) return;
          setTranslatedText(tx);
          setDetectedLang(tx !== desc ? detectedSourceLanguage : '');
        } else {
          setTranslatedText('');
          setDetectedLang('');
        }

        const title = effectiveItem?.title || effectiveItem?.intervention_title || '';
        if (title) {
          const { translatedText: tt, detectedSourceLanguage: tl } = await translateText(title);
          if (!alive) return;
          setTranslatedTitle(tt);
          setTitleLang(tt !== title ? tl : '');
        } else {
          setTranslatedTitle('');
          setTitleLang('');
        }
      } catch {
        if (!alive) return;
        setTranslatedText(effectiveItem?.description || '');
        setTranslatedTitle(effectiveItem?.title || effectiveItem?.intervention_title || '');
        setDetectedLang('');
        setTitleLang('');
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [effectiveItem]);

  const effectiveMediaList: InterventionMedia[] = useMemo(
    () => getAllMedia(effectiveItem),
    [effectiveItem]
  );

  const effectiveMediaBadge = useMemo(
    () => getMediaBadge(effectiveMediaList),
    [effectiveMediaList]
  );

  const mediaLinks = useMemo(
    () =>
      effectiveMediaList
        // Exclude media types that are already shown as embedded players in MediaContent
        // (video, audio, streaming) to prevent showing a redundant "Open link" button
        // alongside an already-working player.
        .filter((m) => !['video', 'audio', 'streaming'].includes(m.media_type))
        .map((m, idx) => {
          const label = m.title || `${t('Media')} ${idx + 1}`;
          const href = getOpenLinkUrl(m);
          const text = m.media_type === 'pdf' ? t('Open PDF') : t('Open link');
          return { href, label, text };
        })
        .filter((x) => Boolean(x.href))
        .filter((x, idx, arr) => arr.findIndex((y) => y.href === x.href) === idx),
    [effectiveMediaList, t]
  );

  if (loading) return null;

  if (!effectiveItem) {
    return (
      <Layout>
        <div className="flex flex-col gap-2">
          <Button size="icon" variant="secondary" onClick={() => navigate(-1)} className="bg-white">
            <ArrowLeftIcon />
            <span className="sr-only">{t('Back')}</span>
          </Button>

          <ErrorAlert message={t('Intervention not found.')} onClose={() => navigate(-1)} />
        </div>
      </Layout>
    );
  }

  const titleRaw = effectiveItem?.title || effectiveItem?.intervention_title || '';
  const effectiveIsPrivate = Boolean(effectiveItem?.is_private);

  return (
    <Layout>
      <div ref={tooltipContainerRef} className="flex flex-col gap-2">
        <div className="flex justify-between align-items-center">
          <Button size="icon" variant="secondary" onClick={() => navigate(-1)} className="bg-white">
            <ArrowLeftIcon />
            <span className="sr-only">{t('Back')}</span>
          </Button>

          {targetDate && (
            <div className="flex flex-wrap gap-2 justify-end">
              {!completed && (
                <Button
                  variant="secondary"
                  className="bg-white text-zinc-400"
                  onClick={() => setShowRescheduleSheet(true)}
                >
                  {t('Reschedule')}
                  <CalendarIcon />
                </Button>
              )}

              <Button
                disabled={isBusy}
                aria-pressed={completed}
                onClick={handleToggleCompleted}
                variant={completed ? 'default' : 'secondary'}
                className={!completed && 'bg-white text-zinc-400'}
              >
                {(() => {
                  const isBehaviorChange =
                    effectiveItem?.intervention?.aim?.toLowerCase() === 'behavior change';
                  if (isBusy) return <Skeleton className="w-20 h-6 rounded-full" />;
                  if (completed) return isBehaviorChange ? t('Viewed') : t('Done');
                  return isBehaviorChange ? t('Mark as viewed') : t('Mark as done');
                })()}
                {completed ? <CircleCheckFillIcon /> : <CircleHalfCheckIcon />}
              </Button>
            </div>
          )}
        </div>

        {error ? <ErrorAlert message={error} onClose={() => setError('')} /> : null}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start">
          <Section>
            <Card className="flex flex-col items-start gap-3">
              <Badge variant="card">
                {lower(effectiveItem.intervention.aim) === 'exercise' ? (
                  <ExerciseIcon className="flex-none w-8 h-8" />
                ) : (
                  <EducationIcon className="flex-none w-8 h-8" />
                )}
                <span
                  className={`text-xl ${lower(effectiveItem.intervention.aim) === 'exercise' ? 'text-pink' : 'text-yellow'}`}
                >
                  {effectiveItem.intervention.aim ? t(effectiveItem.intervention.aim) : null}
                </span>
              </Badge>
              {effectiveIsPrivate && (
                <OverlayTrigger
                  container={tooltipContainerRef}
                  overlay={<Tooltip>{t('Private intervention')}</Tooltip>}
                >
                  <span className="text-zinc-800 -mb-4">
                    <FaLock />
                  </span>
                </OverlayTrigger>
              )}
              <div className="font-bold text-2xl leading-7 text-zinc-800">
                {titleLang ? (
                  <OverlayTrigger
                    container={tooltipContainerRef}
                    overlay={<Tooltip>{titleRaw}</Tooltip>}
                  >
                    <span>{translatedTitle}</span>
                  </OverlayTrigger>
                ) : (
                  titleRaw
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {effectiveItem.intervention.duration && (
                  <Badge variant="card">
                    <ClockIcon className="w-6 h-6" />
                    <span className="text-xl">{`${effectiveItem.intervention.duration}min`}</span>
                  </Badge>
                )}
                <Badge
                  variant="card"
                  role={effectiveMediaList.length > 0 ? 'button' : undefined}
                  tabIndex={effectiveMediaList.length > 0 ? 0 : undefined}
                  onClick={
                    effectiveMediaList.length > 0
                      ? () => mediaRef.current?.scrollIntoView({ behavior: 'smooth' })
                      : undefined
                  }
                  onKeyDown={
                    effectiveMediaList.length > 0
                      ? (e) =>
                          e.key === 'Enter' &&
                          mediaRef.current?.scrollIntoView({ behavior: 'smooth' })
                      : undefined
                  }
                  className={
                    effectiveMediaList.length > 0
                      ? 'cursor-pointer lg:cursor-default lg:pointer-events-none'
                      : ''
                  }
                >
                  {effectiveMediaBadge.icon === 'media' && <MediaIcon className="w-6 h-6" />}
                  {effectiveMediaBadge.icon === 'reader' && <ReaderIcon className="w-6 h-6" />}
                  <span className="text-xl">{t(effectiveMediaBadge.label)}</span>
                </Badge>
              </div>
            </Card>
          </Section>

          <div ref={mediaRef}>
            <Section>
              <MediaContent mediaList={effectiveMediaList} />

              {!!mediaLinks.length && (
                <div className="py-2 flex flex-col gap-2">
                  {mediaLinks.map((link, idx) => (
                    <a
                      key={`${link.href}-${idx}`}
                      href={link.href}
                      className="no-underline"
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${link.text}: ${link.label}`}
                    >
                      <Button className="w-full">
                        {link.text}
                        <OpenExternalIcon aria-hidden="true" />
                      </Button>
                    </a>
                  ))}
                  {effectiveItem?.provider && (
                    <span className="text-zinc-500 text-center">
                      {String(effectiveItem.provider)}
                    </span>
                  )}
                </div>
              )}

              <Card className="text-lg text-zinc-500">
                {detectedLang ? (
                  <OverlayTrigger
                    container={tooltipContainerRef}
                    overlay={<Tooltip>{effectiveItem?.description || ''}</Tooltip>}
                  >
                    <span>{translatedText}</span>
                  </OverlayTrigger>
                ) : (
                  effectiveItem?.description || ''
                )}
              </Card>

              {effectiveItem?.notes && (
                <Card className="text-lg text-zinc-500">
                  {t('Notes')}: {effectiveItem.notes}
                </Card>
              )}
            </Section>
          </div>
        </div>
      </div>

      {/* Intervention Feedback Popup */}
      {patientQuestionnairesStore.showFeedbackPopup && (
        <FeedbackPopup
          show
          interventionId={patientQuestionnairesStore.feedbackInterventionId || ''}
          questions={safeInterventionQuestions}
          date={patientQuestionnairesStore.feedbackDateKey}
          onClose={() => patientQuestionnairesStore.closeFeedback()}
        />
      )}

      <RescheduleInterventionSheet
        open={showRescheduleSheet}
        currentDate={targetOccurrenceDate}
        titleLabel={titleRaw}
        onClose={() => setShowRescheduleSheet(false)}
        onSubmit={handleRescheduleSubmit}
      />
    </Layout>
  );
});

export default PatientInterventionDetail;
