import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  ButtonGroup,
  Container,
  OverlayTrigger,
  Row,
  Col,
  Tooltip,
} from 'react-bootstrap';
import { Document, Page } from 'react-pdf';
import { FaLock } from 'react-icons/fa';

import Layout from '@/components/Layout';
import ErrorAlert from '@/components/common/ErrorAlert';
import { PlayableMedia } from '@/components/common/PlayableMedia';
import apiClient from '@/api/client';
import authStore from '@/stores/authStore';
import { patientInterventionsStore, type PatientRec } from '@/stores/patientInterventionsStore';
import { translateText } from '@/utils/translate';
import {
  generateTagColors,
  getTaxonomyTags,
  getBadgeVariantFromIntervention,
  getMediaTypeLabelFromIntervention,
  getTagColor,
} from '@/utils/interventions';

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

type LangOpt = { language: string; title?: string | null };

type DetailItem = {
  title?: string;
  intervention_title?: string;
  description?: string;
  content_type?: string;
  language?: string;
  external_id?: string;
  provider?: string;
  media?: unknown[];
  link?: string;
  media_file?: string;
  media_url?: string;
  available_languages?: string[];
  intervention?: Record<string, unknown>;
  is_private?: boolean;
  aim?: string;
  topic?: string[];
  lc9?: string[];
  where?: string[];
  setting?: string[];
  keywords?: string[];
  benefitFor?: string;
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

const getAllMedia = (item: DetailItem | null): InterventionMedia[] => {
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

const getMetaTags = (item: DetailItem): string[] => {
  const out: string[] = [];
  const src = asRecord(item?.intervention ?? item ?? {});

  const aim = asStr(src.aim || src.benefitFor).trim();
  if (aim) out.push(aim);

  out.push(...asArr<string>(src.topic).map(asStr));
  out.push(...asArr<string>(src.lc9).map(asStr));
  out.push(...asArr<string>(src.where).map(asStr));
  out.push(...asArr<string>(src.setting).map(asStr));
  out.push(...asArr<string>(src.keywords).map(asStr));

  const ct = asStr(item?.content_type || src.content_type).trim();
  if (ct) out.push(ct);

  return uniq(out.map((x) => x.trim()).filter(Boolean));
};

const PatientInterventionDetail: React.FC = observer(() => {
  const navigate = useNavigate();
  const { interventionId = '' } = useParams();
  const { t, i18n } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [localOverride, setLocalOverride] = useState<DetailItem | null>(null);
  const [translatedText, setTranslatedText] = useState('');
  const [translatedTitle, setTranslatedTitle] = useState('');
  const [detectedLang, setDetectedLang] = useState('');
  const [titleLang, setTitleLang] = useState('');
  const [langOptions, setLangOptions] = useState<LangOpt[]>([]);
  const [variantsByLang, setVariantsByLang] = useState<Record<string, DetailItem>>({});
  const [loadingLangs, setLoadingLangs] = useState(false);

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

  const initialItem = useMemo<DetailItem | null>(() => {
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

  const effectiveItem = localOverride || initialItem;

  const toLangList = (x: unknown): string[] => {
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

  const fetchVariants = useCallback(async () => {
    if (!effectiveItem) return;

    const externalId = norm(effectiveItem.external_id);
    const seeded = toLangList(effectiveItem.available_languages);

    const seedOpts: LangOpt[] = seeded.map((l) => ({ language: l, title: null }));
    if (currentLang && !seeded.includes(currentLang)) {
      seedOpts.unshift({ language: currentLang, title: null });
    }
    if (seedOpts.length) setLangOptions(seedOpts);

    try {
      setLoadingLangs(true);

      if (externalId) {
        const res = await apiClient.get('/api/interventions/all/', {
          params: { external_id: externalId },
        });

        const arr = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
            ? res.data.data
            : [];

        const map: Record<string, DetailItem> = {};
        const opts: LangOpt[] = [];

        for (const v of arr) {
          const l = String(v?.language || '')
            .trim()
            .toLowerCase();
          if (!l) continue;
          map[l] = v as DetailItem;
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
      // Keep seeded options when backend variant lookup fails.
    } finally {
      setLoadingLangs(false);
    }
  }, [effectiveItem, currentLang]);

  useEffect(() => {
    void fetchVariants();
  }, [fetchVariants]);

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
        const next = arr?.[0] as DetailItem | undefined;
        if (next) setLocalOverride(next);
      } catch {
        // Ignore language switch errors; keep current variant.
      } finally {
        setLoadingLangs(false);
      }
    },
    [currentLang, variantsByLang, effectiveItem?.external_id]
  );

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

  const interventionForBadges: unknown = effectiveItem?.intervention ?? effectiveItem;
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
            <div style={{ border: '1px solid #e9ecef', borderRadius: 8, padding: 8 }}>
              <Document file={playable}>
                <Page pageNumber={1} width={320} />
              </Document>
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
    if (!effectiveItem) return null;

    const tags = getMetaTags(effectiveItem);
    if (!tags.length) return null;

    return (
      <div className="flex flex-wrap gap-1" aria-label={t('Tags')}>
        {tags.map((x, idx) => {
          const bg = getTagColor(tagColors, x) || '#6f2dbd';
          return (
            <span
              key={`${x}-${idx}`}
              className="py-1 px-2 rounded-full "
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
    if (!effectiveMediaList.length) {
      return <div className="text-muted">{t('No media available.')}</div>;
    }
    return <div>{effectiveMediaList.map((m, idx) => renderOneMedia(m, idx))}</div>;
  };

  if (loading) return null;

  if (!effectiveItem) {
    return (
      <Layout>
        <Container className="py-4">
          <ErrorAlert message={t('Intervention not found.')} onClose={() => navigate('/patient')} />
          <Button variant="secondary" className="mt-3" onClick={() => navigate(-1)}>
            {t('Back')}
          </Button>
        </Container>
      </Layout>
    );
  }

  const titleRaw = effectiveItem?.title || effectiveItem?.intervention_title || '';
  const effectiveIsPrivate = Boolean(effectiveItem?.is_private);

  return (
    <Layout>
      <Container className="py-3 py-md-4">
        <Button variant="outline-secondary" className="mb-3" onClick={() => navigate(-1)}>
          {t('Back')}
        </Button>

        {error ? <ErrorAlert message={error} onClose={() => setError('')} /> : null}

        <div className="bg-white rounded-4 p-3 p-md-4 shadow-sm">
          <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-3">
            <h1 className="h3 m-0 d-flex align-items-center gap-2 flex-wrap">
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
            </h1>
          </div>

          {(loadingLangs || sortedLangOptions.length > 1) && (
            <div className="mb-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <h2 className="h5 m-0">{t('Languages')}</h2>
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
            </div>
          )}

          <Row className="mb-3">
            <Col xs={12} md={6}>
              <h2 className="h5">{t('Description')}</h2>

              <p className="text-muted mb-2">
                {detectedLang ? (
                  <OverlayTrigger overlay={<Tooltip>{effectiveItem?.description || ''}</Tooltip>}>
                    <span>{translatedText}</span>
                  </OverlayTrigger>
                ) : (
                  effectiveItem?.description || ''
                )}
              </p>

              {renderMetaTags()}

              <div className="mt-3 d-flex flex-wrap gap-2">
                <Badge bg={mediaVariant}>{t(mediaLabel, { defaultValue: mediaLabel })}</Badge>

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
                <h2 className="h5 mb-0">{t('Media')}</h2>
                <Badge bg={effectiveMediaBadge.variant}>{t(effectiveMediaBadge.label)}</Badge>
              </div>
              <div className="mt-2">{renderMediaContent()}</div>
            </Col>
          </Row>
        </div>

        <style>{`
          .meta-tag-row{
            display:flex;
            flex-wrap:wrap;
            gap: 10px;
            margin-top: 8px;
            position: relative;
            z-index: 3;
          }
        `}</style>
      </Container>
    </Layout>
  );
});

export default PatientInterventionDetail;
