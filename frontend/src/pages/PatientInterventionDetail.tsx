import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Document, Page } from 'react-pdf';
import { FaLock } from 'react-icons/fa';

import Layout from '@/components/Layout';
import ErrorAlert from '@/components/common/ErrorAlert';
import { PlayableMedia } from '@/components/common/PlayableMedia';
import { Skeleton } from '@/components/ui/skeleton';
import authStore from '@/stores/authStore';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';
import { patientQuestionnairesStore } from '@/stores/patientQuestionnairesStore';
import { translateText } from '@/utils/translate';
import { generateTagColors, getTaxonomyTags, getTagColor } from '@/utils/interventions';

import ArrowLeftIcon from '@/assets/icons/arrow-left-fill.svg?react';
import CircleHalfCheckIcon from '@/assets/icons/circle-half-dotted-check-fill.svg?react';
import CircleCheckFillIcon from '@/assets/icons/circle-check-fill.svg?react';
import ClockIcon from '@/assets/icons/interventions/clock.svg?react';
import MediaIcon from '@/assets/icons/interventions/media.svg?react';
import ReaderIcon from '@/assets/icons/interventions/reader.svg?react';
import ExerciseIcon from '@/assets/icons/interventions/exercise.svg?react';
import EducationIcon from '@/assets/icons/interventions/education.svg?react';
import OpenExternalIcon from '@/assets/icons/open-external-fill.svg?react';

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
};

type NormalizedMedia = Omit<InterventionMedia, 'kind'> & {
  kind: string;
};

const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
const norm = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const lower = (v: unknown) => norm(v).toLowerCase();

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

const isHttpUrl = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
};

const isSpotify = (u: string) => u.includes('spotify.com');
const isYouTube = (u: string) => u.includes('youtube.com') || u.includes('youtu.be');
const isVimeo = (u: string) => u.includes('vimeo.com');
const isSoundCloud = (u: string) => u.includes('soundcloud.com');

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

const asArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (!v) return [];
  if (typeof v === 'object') return [v as T];
  return [];
};

const getAllMedia = (item: any): InterventionMedia[] => {
  const rawMedia = asArray<Record<string, unknown>>(item?.media);

  if (rawMedia.length) {
    return rawMedia
      .map((m): NormalizedMedia => {
        const rawMediaType = asStr(m.media_type) || asStr(m.mediaType) || 'website';

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
        };
      })
      .filter(
        (media): media is InterventionMedia => media.kind === 'external' || media.kind === 'file'
      );
  }

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

const getMetaTags = (item: any): string[] => {
  const out: string[] = [];
  const src = asRecord(item?.intervention ?? item ?? {});

  const aim = asStr(src.aim || src.benefitFor).trim();
  if (aim) out.push(aim);

  out.push(...asArr<string>(src.topic).map(asStr));
  out.push(...asArr<string>(src.lc9).map(asStr));
  out.push(...asArr<string>(src.where).map(asStr));
  out.push(...asArr<string>(src.setting).map(asStr));
  out.push(...asArr<string>(src.keywords).map(asStr));

  return uniq(out.map((x) => x.trim()).filter(Boolean));
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

  const patientId = localStorage.getItem('id') || authStore.id || '';

  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      await authStore.checkAuthentication();

      if (!alive) return;

      if (!authStore.isAuthenticated || authStore.userType !== 'Patient') {
        navigate('/');
        return;
      }

      if (!patientId) {
        setError(String(t('Patient not found.')));
        setLoading(false);
        return;
      }

      if (!patientInterventionsStore.items.length) {
        await patientInterventionsStore.fetchPlan(patientId, i18n.language);
      }

      if (!alive) return;
      setLoading(false);
    };

    run();

    return () => {
      alive = false;
    };
  }, [navigate, patientId, i18n.language, t]);

  const selectedRec = useMemo<PatientRec | null>(() => {
    return (
      patientInterventionsStore.items.find((rec) => rec.intervention_id === interventionId) || null
    );
  }, [interventionId, patientInterventionsStore.items]);

  const targetDate = useMemo(() => {
    const dateParam = searchParams.get('date');
    if (!dateParam || !selectedRec?.dates?.length) return null;

    const parsed = new Date(`${dateParam}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;

    const dateKey = format(parsed, 'yyyy-MM-dd');
    const isAssignedDate = selectedRec.dates.some((d) => asStr(d).startsWith(dateKey));

    return isAssignedDate ? parsed : null;
  }, [searchParams, selectedRec]);

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

  const effectiveItem = useMemo<any | null>(() => {
    if (!selectedRec) return null;

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
      available_languages: asArr<string>(intervention.available_languages),
      intervention,
      is_private: Boolean(intervention.is_private),
      link: asStr(intervention.link) || '',
      media_file: asStr(intervention.media_file) || '',
      media_url: asStr(intervention.media_url) || '',
    };
  }, [selectedRec]);

  useEffect(() => {
    if (!effectiveItem) return;

    const run = async () => {
      try {
        const desc = effectiveItem?.description || '';
        if (desc) {
          const { translatedText: tx, detectedSourceLanguage } = await translateText(desc);
          setTranslatedText(tx);
          setDetectedLang(tx !== desc ? detectedSourceLanguage : '');
        } else {
          setTranslatedText('');
          setDetectedLang('');
        }

        const title = effectiveItem?.title || effectiveItem?.intervention_title || '';
        if (title) {
          const { translatedText: tt, detectedSourceLanguage: tl } = await translateText(title);
          setTranslatedTitle(tt);
          setTitleLang(tt !== title ? tl : '');
        } else {
          setTranslatedTitle('');
          setTitleLang('');
        }
      } catch {
        setTranslatedText(effectiveItem?.description || '');
        setTranslatedTitle(effectiveItem?.title || effectiveItem?.intervention_title || '');
        setDetectedLang('');
        setTitleLang('');
      }
    };

    void run();
  }, [effectiveItem]);

  const effectiveMediaList: InterventionMedia[] = useMemo(
    () => getAllMedia(effectiveItem),
    [effectiveItem]
  );

  const effectiveMediaBadge = useMemo(
    () => getMediaBadge(effectiveMediaList),
    [effectiveMediaList]
  );

  const renderOneMedia = (m: InterventionMedia, idx: number) => {
    const label = m.title || `${t('Media')} ${idx + 1}`;
    const playable = getPlayableUrl(m);

    return (
      <div key={`${idx}-${label}`}>
        {m.media_type === 'pdf' ? (
          <>
            <div className="border border-accent p-4 rounded-3xl mb-2">
              <Document file={playable}>
                <Page pageNumber={1} width={320} />
              </Document>
            </div>
            <a
              href={playable}
              className="rounded-full p-4 pl-5 bg-[#00956C] flex gap-2 items-center justify-center text-zinc-50 font-medium text-lg no-underline"
              target="_blank"
              rel="noreferrer"
            >
              {t('Open PDF')}
              <OpenExternalIcon className="w-6 h-6" aria-hidden="true" />
            </a>
          </>
        ) : m.media_type === 'image' ? (
          <img
            src={playable}
            alt={label}
            className="w-full max-h-[420px] object-contain rounded-3xl"
          />
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
          />
        )}
      </div>
    );
  };

  const renderMetaTags = () => {
    if (!effectiveItem) return null;

    const tags = getMetaTags(effectiveItem);
    if (!tags.length) return null;

    return (
      <div className="flex flex-wrap gap-2" aria-label={t('Tags')}>
        {tags.map((x, idx) => {
          const bg = getTagColor(tagColors, x) || '#6f2dbd';
          return (
            <Badge
              key={`${x}-${idx}`}
              className="bg-white py-[10px] px-3 rounded-xl border border-accent shadow-none font-medium text-lg text-zinc-500"
              title={x}
              style={{ backgroundColor: bg }}
            >
              {t(x, { defaultValue: x })}
            </Badge>
          );
        })}
      </div>
    );
  };

  const renderMediaContent = () => {
    if (!effectiveMediaList.length) return null;
    return <div>{effectiveMediaList.map((m, idx) => renderOneMedia(m, idx))}</div>;
  };

  if (loading) return null;

  if (!effectiveItem) {
    return (
      <Layout>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => navigate(-1)}
            className="rounded-full border border-accent bg-white text-zinc-800 p-4 shadow-none flex items-center justify-center h-14 w-14"
          >
            <ArrowLeftIcon className="w-6 h-6" />
            <span className="sr-only">{t('Back')}</span>
          </Button>

          <ErrorAlert
            message={t('Intervention not found.')}
            onClose={() => navigate(-1)}
            className="mb-0"
          />
        </div>
      </Layout>
    );
  }

  const titleRaw = effectiveItem?.title || effectiveItem?.intervention_title || '';
  const effectiveIsPrivate = Boolean(effectiveItem?.is_private);

  return (
    <Layout>
      <div className="flex flex-col gap-2">
        <div className="flex justify-between align-items-center">
          <Button
            onClick={() => navigate(-1)}
            className="rounded-full border border-accent bg-white text-zinc-800 p-4 shadow-none flex items-center justify-center h-14 w-14"
          >
            <ArrowLeftIcon className="w-6 h-6" />
            <span className="sr-only">{t('Back')}</span>
          </Button>

          {targetDate && (
            <Button
              onClick={handleToggleCompleted}
              disabled={isBusy}
              aria-pressed={completed}
              className={`rounded-full border border-accent p-4 pl-5 shadow-none font-medium text-lg flex gap-2 ${
                completed ? 'bg-[#00956C] text-zinc-50' : 'bg-white text-zinc-400'
              }`}
            >
              {isBusy ? (
                <Skeleton className="w-20 h-6 rounded-full" />
              ) : completed ? (
                t('Done')
              ) : (
                t('Mark as done')
              )}
              {completed ? (
                <CircleCheckFillIcon className="w-6 h-6" />
              ) : (
                <CircleHalfCheckIcon className="w-6 h-6" />
              )}
            </Button>
          )}
        </div>

        {error ? <ErrorAlert message={error} onClose={() => setError('')} /> : null}

        <div className="bg-white rounded-[40px] p-4">
          <div className="rounded-3xl border border-accent p-4 flex flex-col items-start gap-3">
            <Badge className="bg-white py-2 pl-[10px] pr-3 border border-accent rounded-xl flex gap-1 shadow-none">
              {effectiveItem.intervention.aim.toLowerCase() === 'exercise' ? (
                <ExerciseIcon className="flex-none w-8 h-8" />
              ) : (
                <EducationIcon className="flex-none w-8 h-8" />
              )}
              <span
                className={`font-medium text-xl ${effectiveItem.intervention.aim.toLowerCase() === 'exercise' ? 'text-[#F1ADCF]' : 'text-[#EFA73B]'}`}
              >
                {effectiveItem.intervention.aim}
              </span>
            </Badge>
            {effectiveIsPrivate && (
              <OverlayTrigger overlay={<Tooltip>{t('Private intervention')}</Tooltip>}>
                <span className="text-zinc-800 -mb-4">
                  <FaLock />
                </span>
              </OverlayTrigger>
            )}
            <div className="font-bold text-2xl leading-7 text-zinc-800">
              {titleLang ? (
                <OverlayTrigger overlay={<Tooltip>{titleRaw}</Tooltip>}>
                  <span>{translatedTitle}</span>
                </OverlayTrigger>
              ) : (
                titleRaw
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {effectiveItem.intervention.duration_bucket && (
                <Badge className="bg-white py-2 px-3 border border-accent rounded-xl flex gap-1 shadow-none">
                  <ClockIcon className="w-6 h-6" />
                  <span className="font-medium text-xl text-[#00956C]">
                    {effectiveItem.intervention.duration_bucket}
                  </span>
                </Badge>
              )}
              <Badge className="bg-white py-2 px-3 border border-accent rounded-xl flex gap-1 shadow-none">
                {effectiveMediaBadge.icon === 'media' && <MediaIcon className="w-6 h-6" />}
                {effectiveMediaBadge.icon === 'reader' && <ReaderIcon className="w-6 h-6" />}
                <span className="font-medium text-xl text-[#00956C]">
                  {t(effectiveMediaBadge.label)}
                </span>
              </Badge>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2">
            <div>{renderMediaContent()}</div>
            {effectiveItem?.provider && (
              <span className="text-zinc-500 text-center">{String(effectiveItem.provider)}</span>
            )}
          </div>

          <div className="rounded-3xl border border-accent p-4 text-lg text-zinc-500">
            {detectedLang ? (
              <OverlayTrigger overlay={<Tooltip>{effectiveItem?.description || ''}</Tooltip>}>
                <span>{translatedText}</span>
              </OverlayTrigger>
            ) : (
              effectiveItem?.description || ''
            )}
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-4">
          <div className="p-4 flex flex-col gap-2">
            <div className="font-medium text-lg text-zinc-500">Tags</div>
            {renderMetaTags()}
          </div>
        </div>
      </div>
    </Layout>
  );
});

export default PatientInterventionDetail;
