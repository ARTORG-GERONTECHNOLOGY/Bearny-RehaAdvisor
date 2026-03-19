import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Col,
  Modal,
  Row,
  Badge,
  Button,
  Container,
  OverlayTrigger,
  Tooltip,
  ButtonGroup,
} from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaLock } from 'react-icons/fa';

import apiClient from '../../api/client';
import ErrorAlert from '../common/ErrorAlert';
import { translateText } from '../../utils/translate';
import { PlayableMedia } from '../common/PlayableMedia';
import { generateTagColors, getTaxonomyTags } from '../../utils/interventions';
import {
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  getTagColor,
} from '../../utils/interventions';

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
};

type LangOpt = { language: string; title?: string | null };

// ---------- helpers ----------
const asStr = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));

const norm = (v: any) => (typeof v === 'string' ? v.trim() : '');
const lower = (v: any) => norm(v).toLowerCase();

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
      }))
      .filter((m: InterventionMedia) => m.kind === 'external' || m.kind === 'file');
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
  out.push(...asArr<string>(src?.lc9).map(asStr));
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

  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');

  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [variantsByLang, setVariantsByLang] = useState<Record<string, any>>({});
  const [loadingLangs, setLoadingLangs] = useState(false);

  // tag color map (same source as therapist list; fallback ok)
  const tagColors = useMemo(() => generateTagColors(getTaxonomyTags()), []);

  useEffect(() => {
    if (!show) {
      setLocalOverride(null);
      setLangOptions([]);
      setVariantsByLang({});
      setError('');
    }
  }, [show]);

  const toLangList = (x: any): string[] => {
    if (Array.isArray(x)) return x.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
    return [];
  };

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

  // ✅ fetch variants by external_id (if available)
  const fetchVariants = useCallback(async () => {
    if (!show) return;

    const externalId = norm(effectiveItem?.external_id);
    const seeded = toLangList(effectiveItem?.available_languages);

    const seedOpts: LangOpt[] = seeded.map((l) => ({ language: l, title: null }));
    if (currentLang && !seeded.includes(currentLang))
      seedOpts.unshift({ language: currentLang, title: null });
    if (seedOpts.length) setLangOptions(seedOpts);

    try {
      setLoadingLangs(true);

      if (externalId) {
        // if your apiClient already prefixes /api, remove "/api" here
        const res = await apiClient.get('/api/interventions/all/', {
          params: { external_id: externalId },
        });
        const arr = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];

        const map: Record<string, any> = {};
        const opts: LangOpt[] = [];

        for (const v of arr) {
          const l = String(v?.language || '')
            .trim()
            .toLowerCase();
          if (!l) continue;
          map[l] = v;
          opts.push({ language: l, title: v?.title ?? null });
        }

        if (currentLang && !map[currentLang]) {
          map[currentLang] = effectiveItem;
          opts.push({ language: currentLang, title: effectiveItem?.title ?? null });
        }

        const uniqOpts = opts.reduce((acc: LangOpt[], cur) => {
          const key = (cur.language || '').toLowerCase();
          if (!key) return acc;
          if (!acc.find((x) => (x.language || '').toLowerCase() === key)) acc.push(cur);
          return acc;
        }, []);

        setVariantsByLang(map);
        setLangOptions(uniqOpts.length ? uniqOpts : seedOpts);
      }
    } catch {
      // keep seeded options
    } finally {
      setLoadingLangs(false);
    }
  }, [show, effectiveItem, currentLang]);

  useEffect(() => {
    if (!show) return;
    fetchVariants();
  }, [show, fetchVariants]);

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

      if (variantsByLang[nextLang]) {
        setLocalOverride(variantsByLang[nextLang]);
        return;
      }

      const externalId = norm(effectiveItem?.external_id);
      if (!externalId) return;

      try {
        setLoadingLangs(true);
        const res = await apiClient.get('/api/interventions/all/', {
          params: { external_id: externalId, lang: nextLang },
        });

        const arr = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];
        const next = arr?.[0];
        if (next) setLocalOverride(next);
      } catch {
        // ignore
      } finally {
        setLoadingLangs(false);
      }
    },
    [currentLang, variantsByLang, effectiveItem?.external_id, effectiveItem]
  );

  // keep translations in sync with effectiveItem
  useEffect(() => {
    if (!show) return;

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
  }, [show, effectiveItem]);

  const effectiveMediaList: InterventionMedia[] = useMemo(
    () => getAllMedia(effectiveItem),
    [effectiveItem]
  );
  const effectiveMediaBadge = useMemo(
    () => getMediaBadge(effectiveMediaList),
    [effectiveMediaList]
  );

  // media badge color same logic as therapist list
  const interventionForBadges = (effectiveItem?.intervention ?? effectiveItem) as any;
  const mediaVariant = getBadgeVariantFromIntervention(interventionForBadges);
  const mediaLabel = getMediaTypeLabelFromIntervention(interventionForBadges);

  const renderOneMedia = (m: InterventionMedia, idx: number) => {
    const label = m.title || `${t('Media')} ${idx + 1}`;
    const playable = getPlayableUrl(m);

    return (
      <div key={`${idx}-${label}`} className="mb-3">
        <div className="fw-semibold mb-1">{label}</div>

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
    return <div>{effectiveMediaList.map((m, idx) => renderOneMedia(m, idx))}</div>;
  };

  const effectiveIsPrivate = Boolean(effectiveItem?.is_private);

  const confirmClose = useCallback(() => {
    setError('');
    setLangOptions([]);
    setVariantsByLang({});
    setLocalOverride(null);
    handleClose();
  }, [handleClose]);

  const titleRaw = effectiveItem?.title || effectiveItem?.intervention_title || '';

  return (
    <Modal
      show={show}
      onHide={confirmClose}
      centered
      size="lg"
      scrollable
      backdrop="static"
      keyboard
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="d-flex align-items-center gap-2 flex-wrap">
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
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        <Container fluid>
          {/* languages */}
          {(loadingLangs || sortedLangOptions.length > 1) && (
            <Row className="mb-3">
              <Col>
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h5 className="mb-0">{t('Languages')}</h5>
                  {loadingLangs ? <small className="text-muted">{t('Loading…')}</small> : null}
                </div>

                <ButtonGroup className="flex-wrap gap-2">
                  {sortedLangOptions.map((opt) => {
                    const optLang = String(opt.language || '').toLowerCase();
                    const active = optLang === currentLang;
                    return (
                      <Button
                        key={optLang}
                        variant={active ? 'primary' : 'outline-primary'}
                        size="sm"
                        onClick={() => switchVariantByLang(optLang)}
                        aria-pressed={active}
                      >
                        {optLang.toUpperCase()}
                        {!active && optLang === preferredLang ? ' ★' : ''}
                      </Button>
                    );
                  })}
                </ButtonGroup>
              </Col>
            </Row>
          )}

          <Row className="mb-3">
            <Col xs={12} md={6}>
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

              {/* ✅ tags under description */}
              {renderMetaTags()}

              <div className="mt-3 d-flex flex-wrap gap-2">
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
            </Col>

            <Col xs={12} md={6}>
              <div className="d-flex align-items-center justify-content-between">
                <h5 className="mb-0">{t('Media')}</h5>
                <Badge bg={effectiveMediaBadge.variant as any}>
                  {t(effectiveMediaBadge.label)}
                </Badge>
              </div>
              <div className="mt-2">{renderMediaContent()}</div>
            </Col>
          </Row>
        </Container>

        <style>{`
          /* Pills row */
          .meta-tag-row{
            display:flex;
            flex-wrap:wrap;
            gap: 10px;
            margin-top: 8px;
            position: relative;
            z-index: 3; /* ensure above muted text backgrounds */
          }
          .meta-pill{
            display:inline-flex;
            align-items:center;
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
        `}</style>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={confirmClose}>
          {t('Close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PatientInterventionPopUp;
