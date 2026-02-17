// components/TherapistInterventionPage/PatientInterventionPopUp.tsx
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
import { getTagColor } from '../../utils/interventions';
import { useTranslation } from 'react-i18next';
import { Document, Page } from 'react-pdf';
import Microlink from '@microlink/react';
import { FaLock } from 'react-icons/fa';
import { PlayableMedia } from '../common/PlayableMedia';

import apiClient from '../../api/client';
import ErrorAlert from '../common/ErrorAlert';
import { translateText } from '../../utils/translate';

type Props = {
  show: boolean;
  item: any;
  handleClose: () => void;
  tagColors: Record<string, string>;
};

// minimal, FE-friendly media type
export type InterventionMedia = {
  kind: 'external' | 'file';
  media_type: 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
  provider?: string | null;
  title?: string | null;
  url?: string | null;
  embed_url?: string | null;
  file_path?: string | null;
  file_url?: string | null; // if BE provides it
  mime?: string | null;
};

type LangOpt = { language: string; title?: string | null };

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

const getAllMedia = (item: any): InterventionMedia[] => {
  const media = Array.isArray(item?.media) ? item.media : [];

  if (media.length) {
    return media
      .map((m: any) => ({
        kind: m.kind,
        media_type: m.media_type || m.mediaType || 'website',
        provider: m.provider ?? null,
        title: m.title ?? null,
        url: m.url ?? null,
        embed_url: m.embed_url ?? m.embedUrl ?? null,
        file_path: m.file_path ?? m.filePath ?? null,
        file_url: m.file_url ?? m.fileUrl ?? null,
        mime: m.mime ?? null,
      }))
      .filter((m: InterventionMedia) => m.kind === 'external' || m.kind === 'file');
  }

  // legacy fallback
  const out: InterventionMedia[] = [];
  const link = norm(item?.link);
  const mf = norm(item?.media_file);

  if (link && isHttpUrl(link)) {
    out.push({
      kind: 'external',
      media_type: guessMediaTypeFromUrl(link),
      provider: guessProvider(link),
      url: link,
      title: null,
      embed_url: null,
    });
  }
  if (mf) {
    out.push({
      kind: 'file',
      media_type: guessMediaTypeFromFilePath(mf),
      file_path: mf,
      title: null,
      provider: null,
      url: null,
      embed_url: null,
      mime: null,
    });
  }
  return out;
};

const getPlayableUrl = (m: InterventionMedia): string | '' => {
  if (m.media_type === 'streaming' && lower(m.provider) === 'spotify' && m.embed_url)
    return m.embed_url;
  if (m.kind === 'external') return norm(m.url || '');
  if (m.kind === 'file') return norm(m.file_url || m.file_path || '');
  return '';
};

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

const PatientInterventionPopUp: React.FC<Props> = ({ show, item, handleClose, tagColors }) => {
  const { t, i18n } = useTranslation();

  const [error, setError] = useState('');

  // local override allows switching variants without parent involvement
  const [localOverride, setLocalOverride] = useState<any | null>(null);
  const effectiveItem = localOverride || item;

  // translations
  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');

  // languages
  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [variantsByLang, setVariantsByLang] = useState<Record<string, any>>({});
  const [loadingLangs, setLoadingLangs] = useState(false);

  useEffect(() => {
    if (!show) {
      setLocalOverride(null);
      setLangOptions([]);
      setVariantsByLang({});
      setError('');
      return;
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

  // ✅ Fetch all variants when modal opens (use external_id first)
  const fetchVariants = useCallback(async () => {
    if (!show) return;

    const externalId = norm(effectiveItem?.external_id);
    const seeded = toLangList(effectiveItem?.available_languages);

    // ✅ seed language buttons immediately
    const seedOpts: LangOpt[] = seeded.map((l) => ({ language: l, title: null }));
    if (currentLang && !seeded.includes(currentLang))
      seedOpts.unshift({ language: currentLang, title: null });
    if (seedOpts.length) setLangOptions(seedOpts);

    try {
      setLoadingLangs(true);

      // still do the bulk call to preload variantsByLang (nice-to-have)
      if (externalId) {
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

        const uniq = opts.reduce((acc: LangOpt[], cur) => {
          const key = (cur.language || '').toLowerCase();
          if (!key) return acc;
          if (!acc.find((x) => (x.language || '').toLowerCase() === key)) acc.push(cur);
          return acc;
        }, []);

        setVariantsByLang(map);
        setLangOptions(uniq.length ? uniq : seedOpts);
      }
    } catch {
      // ✅ keep seeded languages if fetch fails
    } finally {
      setLoadingLangs(false);
    }
  }, [show, effectiveItem, currentLang]);

  useEffect(() => {
    if (!show) return;
    fetchVariants();
  }, [show, fetchVariants]);

  // Sort languages nicely
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

  // ✅ Switch variant: prefer in-memory variant list, fallback to API call with lang
  const switchVariantByLang = useCallback(
    async (lang: string) => {
      const nextLang = String(lang || '')
        .toLowerCase()
        .trim();
      if (!nextLang || nextLang === currentLang) return;

      // if we already have the variant, use it
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

  // Keep translations in sync with effectiveItem
  useEffect(() => {
    if (!show) return;

    const run = async () => {
      try {
        if (effectiveItem?.description) {
          const { translatedText: tx, detectedSourceLanguage } = await translateText(
            effectiveItem.description
          );
          setTranslatedText(tx);
          setDetectedLang(tx !== effectiveItem.description ? detectedSourceLanguage : '');
        } else {
          setTranslatedText('');
          setDetectedLang('');
        }

        if (effectiveItem?.title) {
          const { translatedText: tt, detectedSourceLanguage: tl } = await translateText(
            effectiveItem.title
          );
          setTranslatedTitle(tt);
          setTitleLang(tt !== effectiveItem.title ? tl : '');
        } else {
          setTranslatedTitle('');
          setTitleLang('');
        }
      } catch {
        setTranslatedText(effectiveItem?.description || '');
        setTranslatedTitle(effectiveItem?.title || '');
        setDetectedLang('');
        setTitleLang('');
      }
    };

    run();
  }, [show, effectiveItem]);

  // media
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

    // Use the shared fallback chain.
    // Only visible action is the Open link button.
    return (
      <div key={`${idx}-${label}`} className="mb-3">
        <div className="fw-semibold mb-1">{label}</div>

        {/* Keep PDFs/images handled as before (better UX),
          but everything else goes through PlayableMedia */}
        {m.media_type === 'pdf' ? (
          <>
            <div style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 8 }}>
              <Document file={getPlayableUrl(m)}>
                <Page pageNumber={1} width={320} />
              </Document>
            </div>
            <a
              href={getPlayableUrl(m)}
              className="btn btn-outline-primary btn-sm mt-2"
              target="_blank"
              rel="noreferrer"
            >
              {t('Open PDF')}
            </a>
          </>
        ) : m.media_type === 'image' ? (
          <img
            src={getPlayableUrl(m)}
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
            <OverlayTrigger overlay={<Tooltip>{effectiveItem?.title}</Tooltip>}>
              <span>{translatedTitle}</span>
            </OverlayTrigger>
          ) : (
            effectiveItem?.title
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {error && <ErrorAlert message={error} onClose={() => setError('')} />}

        <Container fluid>
          {/* ✅ Languages (now works because we fetch variants) */}
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
              <p className="text-muted mb-0">
                {detectedLang ? (
                  <OverlayTrigger overlay={<Tooltip>{effectiveItem?.description}</Tooltip>}>
                    <span>{translatedText}</span>
                  </OverlayTrigger>
                ) : (
                  effectiveItem?.description
                )}
              </p>

              <div className="mt-3 d-flex flex-wrap gap-2">
                {effectiveItem?.external_id && (
                  <Badge bg="secondary">external_id: {effectiveItem.external_id}</Badge>
                )}
                {effectiveItem?.provider && (
                  <Badge bg="secondary">provider: {String(effectiveItem.provider)}</Badge>
                )}
                {effectiveItem?.content_type && (
                  <Badge bg="light" text="dark">
                    {t('Content Type')}: {t(String(effectiveItem.content_type))}
                  </Badge>
                )}
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

          <Row className="mb-3">
            <Col>
              <h5>{t('Tags & Benefits')}</h5>
              <div className="mb-2">
                {(effectiveItem?.tags || []).map((tag: string) => (
                  <Badge
                    key={tag}
                    className="me-2 mb-1"
                    style={{
                      backgroundColor: getTagColor(tagColors, tag) || '#888',
                      color: '#fff',
                    }}
                  >
                    {t(tag)}
                  </Badge>
                ))}

                {(effectiveItem?.benefitFor || []).map((b: string) => (
                  <Badge key={b} className="me-2 mb-1 bg-info text-dark">
                    {t(b)}
                  </Badge>
                ))}
              </div>
            </Col>
          </Row>
        </Container>
      </Modal.Body>
    </Modal>
  );
};

export default PatientInterventionPopUp;
