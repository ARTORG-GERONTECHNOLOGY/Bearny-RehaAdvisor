import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaLock } from 'react-icons/fa';

import apiClient from '@/api/client';
import ErrorAlert from '@/components/common/ErrorAlert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { translateText } from '@/utils/translate';
import { isHttpUrl, matchesHost } from '@/utils/urlUtils';
import { PlayableMedia } from '@/components/common/PlayableMedia';
import { generateTagColors, getTaxonomyTags } from '@/utils/interventions';
import {
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  getTagColor,
} from '@/utils/interventions';
import ArrowLeftIcon from '@/assets/icons/arrow-left-fill.svg?react';
import ArrowRightIcon from '@/assets/icons/arrow-right-fill.svg?react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

// ---------- types ----------
type Props = {
  show: boolean;
  item: any;
  handleClose: () => void;
};

// minimal media type
export type InterventionMedia = {
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

type LangOpt = { language: string; title?: string | null };

// ---------- helpers ----------
const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

const norm = (v: any) => (typeof v === 'string' ? v.trim() : '');
const lower = (v: any) => norm(v).toLowerCase();

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

// Harden: accept array | object | string
const asArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (!v) return [];
  if (typeof v === 'object') return [v as T];
  return [];
};

const getAllMedia = (item: any): InterventionMedia[] => {
  const rawMedia = asArray<any>(item?.media);

  if (rawMedia.length) {
    return rawMedia
      .map((m: any) => ({
        kind: (m.kind || '') as any,
        media_type: (m.media_type || m.mediaType || 'website') as any,
        provider: m.provider ?? null,
        title: m.title ?? null,
        url: m.url ?? null,
        embed_url: m.embed_url ?? m.embedUrl ?? null,
        file_path: m.file_path ?? m.filePath ?? null,
        file_url: m.file_url ?? m.fileUrl ?? null,
        mime: m.mime ?? null,
        thumbnail: m.thumbnail ?? null,
        media_slot: typeof m.media_slot === 'number' ? m.media_slot : null,
      }))
      .filter((m: InterventionMedia) => m.kind === 'external' || m.kind === 'file')
      .sort(
        (a: InterventionMedia, b: InterventionMedia) => (a.media_slot ?? 1) - (b.media_slot ?? 1)
      );
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
  if (m.media_type === 'streaming' && lower(m.provider) === 'spotify' && m.embed_url)
    return m.embed_url;
  if (m.kind === 'external') return norm(m.url || '');
  if (m.kind === 'file') return norm(m.file_url || m.file_path || '');
  return '';
};

// Keep this for "Media" section label only
const getMediaBadge = (media: InterventionMedia[]) => {
  if (!media.length) return { label: 'No media', variant: 'secondary' as const };
  const types = new Set(media.map((m) => m.media_type));
  if (types.size > 1) return { label: 'Mixed', variant: 'primary' as const };

  const only = [...types][0];
  switch (only) {
    case 'video':
      return { label: 'Video', variant: 'danger' as const };
    case 'audio':
    case 'streaming':
      return { label: 'Audio', variant: 'warning' as const };
    case 'pdf':
      return { label: 'PDF', variant: 'info' as const };
    case 'image':
      return { label: 'Image', variant: 'success' as const };
    case 'app':
      return { label: 'App', variant: 'dark' as const };
    default:
      return { label: 'Link', variant: 'secondary' as const };
  }
};

// ✅ “library-style” tags under description
// NOTE: on patient payload, meta often lives under item.intervention (from plan)
const getMetaTags = (item: any): string[] => {
  const out: string[] = [];
  const src = item?.intervention ?? item ?? {};

  const aim = asStr(src?.aim || src?.benefitFor).trim();
  if (aim) out.push(aim);

  out.push(...asArr<string>(src?.topic).map(asStr));
  out.push(...asArr<string>(src?.where).map(asStr));
  out.push(...asArr<string>(src?.setting).map(asStr));
  out.push(...asArr<string>(src?.keywords).map(asStr));

  const ct = asStr(item?.content_type || src?.content_type).trim();
  if (ct) out.push(ct);

  return uniq(out.map((x) => x.trim()).filter(Boolean));
};

const PatientInterventionPopUp: React.FC<Props> = ({ show, item, handleClose }) => {
  const { t, i18n } = useTranslation();

  const [error, setError] = useState('');

  const [localOverride, setLocalOverride] = useState<any | null>(null);
  const effectiveItem = localOverride || item;

  // true once the patient has actively picked a language via the toggle
  const [langManuallySelected, setLangManuallySelected] = useState(false);

  // guards against a slower, older switch response overwriting a newer one
  const switchRequestIdRef = useRef(0);

  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');

  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [loadingLangs, setLoadingLangs] = useState(false);

  const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);

  // tag color map (same source as therapist list; fallback ok)
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);

  useEffect(() => {
    if (!show) {
      setLocalOverride(null);
      setLangOptions([]);
      setError('');
      setLangManuallySelected(false);
    }
    // invalidate any in-flight language switch so its response can't land after
    // close or unmount — runs on every show change and on unmount
    return () => {
      switchRequestIdRef.current += 1;
    };
  }, [show]);

  const preferredLang = useMemo(() => {
    const l = (i18n?.language || '').slice(0, 2).toLowerCase();
    return l || 'en';
  }, [i18n?.language]);

  const currentLang = useMemo(
    () =>
      String(effectiveItem?.language || '')
        .trim()
        .toLowerCase(),
    [effectiveItem?.language]
  );

  // populate language options from item.available_languages
  useEffect(() => {
    if (!show) return;
    if (!effectiveItem) {
      setLangOptions([]);
      return;
    }

    const current = String(effectiveItem?.language || '')
      .trim()
      .toLowerCase();
    const raw: string[] = Array.isArray(effectiveItem?.available_languages)
      ? (effectiveItem.available_languages as unknown[])
          .map((v) => String(v).trim().toLowerCase())
          .filter(Boolean)
      : [];
    const opts: LangOpt[] = raw.map((l) => ({ language: l, title: null }));

    const merged = [
      ...(current ? [{ language: current, title: effectiveItem?.title ?? null }] : []),
      ...opts,
    ].reduce((acc: LangOpt[], cur) => {
      const key = (cur.language || '').toLowerCase();
      if (!key) return acc;
      if (!acc.find((a) => (a.language || '').toLowerCase() === key)) acc.push(cur);
      return acc;
    }, []);

    setLangOptions(merged);
  }, [show, effectiveItem]);

  const sortedLangOptions = useMemo(() => {
    const score = (l: string) => {
      const ll = String(l || '').toLowerCase();
      if (ll === preferredLang) return 0;
      if (ll === 'en') return 1;
      if (ll === 'de') return 2;
      return 3;
    };

    return [...(langOptions || [])]
      .filter((x) => x?.language)
      .sort(
        (a, b) => score(a.language) - score(b.language) || a.language.localeCompare(b.language)
      );
  }, [langOptions, preferredLang]);

  const switchVariantByLang = useCallback(
    async (lang: string) => {
      const nextLang = String(lang || '')
        .toLowerCase()
        .trim();
      if (!nextLang || nextLang === currentLang) return;

      const externalId = norm(effectiveItem?.external_id);
      if (!externalId) return;

      const requestId = ++switchRequestIdRef.current;

      try {
        setLoadingLangs(true);
        const res = await apiClient.get('interventions/all/', {
          params: { external_id: externalId, lang: nextLang },
        });

        // a newer switch was triggered while this one was in flight — drop it
        if (requestId !== switchRequestIdRef.current) return;

        const arr = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        const next = arr?.[0];
        if (next) {
          setLocalOverride(next);
          setLangManuallySelected(true);
        }
      } catch {
        // ignore
      } finally {
        if (requestId === switchRequestIdRef.current) setLoadingLangs(false);
      }
    },
    [currentLang, effectiveItem?.external_id]
  );

  // keep translations in sync with effectiveItem
  useEffect(() => {
    if (!show) return;

    // manually picked variant: show as-is, don't translate back to app language
    if (langManuallySelected) {
      setTranslatedText(effectiveItem?.description || '');
      setTranslatedTitle(effectiveItem?.title || effectiveItem?.intervention_title || '');
      setDetectedLang('');
      setTitleLang('');
      return;
    }

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

    run();
  }, [show, effectiveItem, langManuallySelected]);

  const effectiveMediaList: InterventionMedia[] = useMemo(
    () => getAllMedia(effectiveItem),
    [effectiveItem]
  );
  const effectiveMediaBadge = useMemo(
    () => getMediaBadge(effectiveMediaList),
    [effectiveMediaList]
  );

  // Reset to first item whenever the media list changes (e.g. item/language switch)
  useEffect(() => {
    setActiveMediaIndex(0);
  }, [effectiveItem]);

  // media badge color same logic as therapist list
  const interventionForBadges = (effectiveItem?.intervention ?? effectiveItem) as any;
  const mediaVariant = getBadgeVariantFromIntervention(interventionForBadges);
  const mediaLabel = getMediaTypeLabelFromIntervention(interventionForBadges);

  const renderOneMedia = (m: InterventionMedia, idx: number, hideLabel = false) => {
    const label = m.title || `${t('Media')} ${idx + 1}`;
    const playable = getPlayableUrl(m);

    return (
      <div key={`${idx}-${label}`} className="mb-3">
        {!hideLabel && <div className="fw-semibold mb-1">{label}</div>}

        {m.media_type === 'pdf' ? (
          <>
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
            <a
              href={playable}
              className="btn btn-outline-primary btn-sm mt-2"
              target="_blank"
              rel="noreferrer"
            >
              {t('Open PDF')}
            </a>
          </>
        ) : m.media_type === 'image' ? (
          <img
            src={playable}
            alt={label}
            className="img-fluid rounded"
            style={{ maxHeight: 420, objectFit: 'contain' }}
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
    const tags = getMetaTags(effectiveItem);
    if (!tags.length) return null;

    return (
      <div className="meta-tag-row" aria-label={t('Tags')}>
        {tags.map((x, idx) => {
          const bg = getTagColor(tagColors, x) || '#6f2dbd';
          return (
            <span
              key={`${x}-${idx}`}
              className="meta-pill"
              title={x}
              style={{ backgroundColor: bg, color: '#fff' }}
            >
              {t(x, { defaultValue: x })}
            </span>
          );
        })}
      </div>
    );
  };

  const renderMediaContent = () => {
    if (!effectiveMediaList.length)
      return <div className="text-muted">{t('No media available.')}</div>;

    if (effectiveMediaList.length === 1) {
      return <div>{renderOneMedia(effectiveMediaList[0], 0)}</div>;
    }

    // 2+ media items — carousel: one item at a time with prev/next and dot indicators
    const total = effectiveMediaList.length;
    const clampedIndex = Math.min(activeMediaIndex, total - 1);

    return (
      <div data-testid="media-carousel">
        {/* Current media */}
        <div>{renderOneMedia(effectiveMediaList[clampedIndex], clampedIndex, false)}</div>

        {/* Navigation bar */}
        <div className="media-carousel__nav">
          <button
            className="btn btn-sm btn-outline-secondary media-carousel__arrow"
            onClick={() => setActiveMediaIndex((i: number) => Math.max(0, i - 1))}
            disabled={clampedIndex === 0}
            aria-label={t('Previous media')}
            data-testid="media-prev"
          >
            <ArrowLeftIcon aria-hidden="true" />
          </button>

          <div className="media-carousel__center">
            {/* Dot indicators — only when ≤7 items to keep UI clean */}
            {total <= 7 && (
              <div className="media-carousel__dots" role="tablist" aria-label={t('Media items')}>
                {effectiveMediaList.map((m, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={i === clampedIndex}
                    aria-label={m.title || `${t('Media')} ${i + 1}`}
                    className={`media-dot${i === clampedIndex ? ' active' : ''}`}
                    onClick={() => setActiveMediaIndex(i)}
                    data-testid={`media-dot-${i}`}
                  />
                ))}
              </div>
            )}
            <div className="media-carousel__counter" aria-live="polite">
              {clampedIndex + 1} / {total}
            </div>
          </div>

          <button
            className="btn btn-sm btn-outline-secondary media-carousel__arrow"
            onClick={() => setActiveMediaIndex((i: number) => Math.min(total - 1, i + 1))}
            disabled={clampedIndex === total - 1}
            aria-label={t('Next media')}
            data-testid="media-next"
          >
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  const effectiveIsPrivate = Boolean(effectiveItem?.is_private);

  const confirmClose = useCallback(() => {
    setError('');
    setLangOptions([]);
    setLocalOverride(null);
    setLangManuallySelected(false);
    handleClose();
  }, [handleClose]);

  const titleRaw = effectiveItem?.title || effectiveItem?.intervention_title || '';

  return (
    <Dialog open={show} onOpenChange={(open) => !open && confirmClose()}>
      <DialogContent className="max-w-3xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {effectiveIsPrivate && (
              <OverlayTrigger overlay={<Tooltip>{t('Private intervention')}</Tooltip>}>
                <span className="text-muted">
                  <FaLock />
                </span>
              </OverlayTrigger>
            )}

            {titleLang ? (
              <OverlayTrigger overlay={<Tooltip>{titleRaw}</Tooltip>}>
                <span>{translatedTitle}</span>
              </OverlayTrigger>
            ) : (
              titleRaw
            )}
          </DialogTitle>
        </DialogHeader>

        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        <div className="w-full">
          {/* languages */}
          {(loadingLangs || sortedLangOptions.length > 1) && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h5 className="mb-0">{t('Languages')}</h5>
                {loadingLangs ? <small className="text-muted">{t('Loading…')}</small> : null}
              </div>

              <ButtonGroup>
                {sortedLangOptions.map((opt) => {
                  const optLang = String(opt.language || '').toLowerCase();
                  const active = optLang === currentLang;
                  return (
                    <Button
                      key={optLang}
                      size="dashboard"
                      variant={active ? undefined : 'secondary'}
                      onClick={() => switchVariantByLang(optLang)}
                      aria-pressed={active}
                    >
                      {optLang.toUpperCase()}
                    </Button>
                  );
                })}
              </ButtonGroup>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-3">
            <div className="md:col-span-6">
              <h5>{t('Description')}</h5>

              <p className="text-muted mb-2">
                {detectedLang ? (
                  <OverlayTrigger overlay={<Tooltip>{effectiveItem?.description}</Tooltip>}>
                    <span>{translatedText}</span>
                  </OverlayTrigger>
                ) : (
                  effectiveItem?.description
                )}
              </p>

              {renderMetaTags()}

              <div className="mt-3 flex flex-wrap gap-2">
                {/* content type badge should match therapist colors */}
                <Badge bg={mediaVariant as any} aria-label={t('Media type')}>
                  {t(mediaLabel, { defaultValue: mediaLabel })}
                </Badge>

                {effectiveItem?.language ? (
                  <Badge bg="secondary">{String(effectiveItem.language).toUpperCase()}</Badge>
                ) : null}

                {effectiveItem?.provider ? (
                  <Badge bg="light" text="dark">
                    {String(effectiveItem.provider)}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-6">
              <div className="flex items-center justify-between">
                <h5 className="mb-0">{t('Media')}</h5>
                <Badge bg={effectiveMediaBadge.variant as any}>
                  {t(effectiveMediaBadge.label)}
                </Badge>
              </div>
              <div className="mt-2">{renderMediaContent()}</div>
            </div>
          </div>
        </div>

        <style>{`
          .meta-tag-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 8px;
            position: relative;
            z-index: 3;
          }
          .meta-pill {
            display: inline-flex;
            align-items: center;
            padding: 8px 12px;
            border-radius: 10px;
            font-weight: 800;
            font-size: .9rem;
            line-height: 1;
            max-width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          /* ── Media carousel ─────────────────────────────── */
          .media-carousel__nav {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 12px;
            gap: 8px;
          }
          .media-carousel__arrow {
            flex-shrink: 0;
            width: 36px;
            height: 36px;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .media-carousel__arrow svg {
            width: 16px;
            height: 16px;
          }
          .media-carousel__center {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            min-width: 0;
          }
          .media-carousel__dots {
            display: flex;
            gap: 6px;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
          }
          .media-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            border: none;
            padding: 0;
            cursor: pointer;
            background-color: #dee2e6;
            transition: background-color 0.2s, width 0.15s, height 0.15s;
          }
          .media-dot.active {
            background-color: #0d6efd;
            width: 10px;
            height: 10px;
          }
          .media-carousel__counter {
            font-size: 0.78rem;
            color: #6c757d;
            user-select: none;
          }
        `}</style>

        <DialogFooter>
          <Button size="dashboard" variant="secondary" onClick={confirmClose}>
            {t('Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PatientInterventionPopUp;
