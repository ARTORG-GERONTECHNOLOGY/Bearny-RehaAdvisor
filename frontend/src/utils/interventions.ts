// src/utils/interventions.ts
// Media normalization + badge helpers + taxonomy-based tag colors (stable)
// Includes: aliasing for common typos + normalized lookup helper
// Includes: helper to generate colors from interventions.json taxonomy
// Includes: language helpers for available_languages arrays

import interventionsConfig from '../config/interventions.json';

export type LangOpt = { language: string; title?: string | null };

export type InterventionMedia = {
  kind: 'external' | 'file';
  media_type: 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
  provider?: string | null;
  title?: string | null;

  // external
  url?: string | null;
  embed_url?: string | null;

  // file
  file_path?: string | null;
  file_url?: string | null; // from BE (absolute URL)
  mime?: string | null;

  thumbnail?: string | null;
};

/** ---------------- tiny type helpers ---------------- */

type UnknownRecord = Record<string, unknown>;

const isRecord = (v: unknown): v is UnknownRecord => typeof v === 'object' && v !== null;

const get = (obj: unknown, key: string): unknown => (isRecord(obj) ? obj[key] : undefined);

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

const asArray = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const norm = (v: unknown) => asString(v).trim();
const lower = (v: unknown) => norm(v).toLowerCase();

/** ---------------- URL helpers ---------------- */

export const isHttpUrl = (u: string) => {
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

/** ---------------- Media type guessing ---------------- */

export const guessMediaTypeFromFilePath = (p: string): InterventionMedia['media_type'] => {
  const path = lower(p);
  if (!path) return 'text';

  if (path.match(/\.(mp3|wav|m4a|ogg|webm)$/)) return 'audio';
  if (path.match(/\.(mp4|mov|m4v|webm)$/)) return 'video';
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'image';

  return 'text';
};

export const guessMediaTypeFromUrl = (u: string): InterventionMedia['media_type'] => {
  const url = lower(u);
  if (!url) return 'website';

  if (isSpotify(url)) return 'streaming';
  if (isYouTube(url) || isVimeo(url)) return 'video';
  if (isSoundCloud(url)) return 'audio';

  if (url.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/)) return 'audio';
  if (url.match(/\.(mp4|mov|m4v|webm)(\?|$)/)) return 'video';
  if (url.match(/\.(pdf)(\?|$)/)) return 'pdf';
  if (url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'image';

  return 'website';
};

export const guessProvider = (u: string) => {
  const url = lower(u);
  if (!url) return 'website';
  if (isSpotify(url)) return 'spotify';
  if (isYouTube(url)) return 'youtube';
  if (isSoundCloud(url)) return 'soundcloud';
  if (isVimeo(url)) return 'vimeo';
  return 'website';
};

/** ---------------- Media normalization ---------------- */

/**
 * Normalize media:
 * - Prefer new model: item.media[]
 * - Fallback to legacy: link/media_file/media_url
 */
export function getAllMedia(item?: unknown): InterventionMedia[] {
  const mediaRaw = get(item, 'media');
  const list = asArray<unknown>(mediaRaw);

  // New model
  if (list.length) {
    return list
      .map((m): InterventionMedia | null => {
        if (!isRecord(m)) return null;

        const kind = (get(m, 'kind') === 'file' ? 'file' : 'external') as InterventionMedia['kind'];

        const url = norm(get(m, 'url'));
        const embed = norm(get(m, 'embed_url')) || norm(get(m, 'embedUrl'));
        const fileUrl = norm(get(m, 'file_url')) || norm(get(m, 'fileUrl'));
        const filePath = norm(get(m, 'file_path')) || norm(get(m, 'filePath'));

        const rawMediaType = norm(get(m, 'media_type')) || norm(get(m, 'mediaType'));
        const derivedType =
          (rawMediaType as InterventionMedia['media_type']) ||
          (kind === 'file'
            ? guessMediaTypeFromUrl(fileUrl) || guessMediaTypeFromFilePath(filePath)
            : guessMediaTypeFromUrl(embed || url));

        return {
          kind,
          media_type: (derivedType || 'website') as InterventionMedia['media_type'],
          provider: (get(m, 'provider') as string) ?? (url ? guessProvider(url) : null),
          title: (get(m, 'title') as string) ?? null,
          url: (get(m, 'url') as string) ?? null,
          embed_url: (get(m, 'embed_url') as string) ?? (get(m, 'embedUrl') as string) ?? null,
          file_path: (get(m, 'file_path') as string) ?? (get(m, 'filePath') as string) ?? null,
          file_url: (get(m, 'file_url') as string) ?? (get(m, 'fileUrl') as string) ?? null,
          mime: (get(m, 'mime') as string) ?? null,
          thumbnail: (get(m, 'thumbnail') as string) ?? null,
        };
      })
      .filter((x): x is InterventionMedia => Boolean(x))
      .filter((m) => m.kind === 'external' || m.kind === 'file');
  }

  // Legacy fallback
  const out: InterventionMedia[] = [];
  const link = norm(get(item, 'link')) || norm(get(item, 'url'));
  const mf = norm(get(item, 'media_file')) || norm(get(item, 'file_path'));
  const mu = norm(get(item, 'media_url'));

  if (link && isHttpUrl(link)) {
    out.push({
      kind: 'external',
      media_type: guessMediaTypeFromUrl(link),
      provider: guessProvider(link),
      url: link,
      title: null,
      embed_url: null,
      file_path: null,
      file_url: null,
      mime: null,
      thumbnail: null,
    });
  }

  // if backend gave absolute media URL
  if (mu && isHttpUrl(mu)) {
    out.push({
      kind: 'file',
      media_type: guessMediaTypeFromUrl(mu),
      provider: null,
      title: null,
      url: null,
      embed_url: null,
      file_path: null,
      file_url: mu,
      mime: null,
      thumbnail: null,
    });
  } else if (mf) {
    out.push({
      kind: 'file',
      media_type: guessMediaTypeFromFilePath(mf),
      provider: null,
      title: null,
      url: null,
      embed_url: null,
      file_path: mf,
      file_url: null,
      mime: null,
      thumbnail: null,
    });
  }

  return out;
}

export function getPrimaryMedia(item?: unknown): InterventionMedia | null {
  const list = getAllMedia(item);
  return list.length ? list[0] : null;
}

export const getPlayableUrl = (m?: InterventionMedia | null): string => {
  if (!m) return '';

  // For spotify we prefer embed (if provided)
  if (m.media_type === 'streaming' && lower(m.provider) === 'spotify' && m.embed_url) {
    return m.embed_url;
  }

  if (m.kind === 'external') return norm(m.url || '');
  if (m.kind === 'file') return norm(m.file_url || m.file_path || '');
  return '';
};

export const getMediaBadge = (media: InterventionMedia[]) => {
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
    case 'website':
    case 'text':
    default:
      return { label: 'Link', variant: 'secondary' as const };
  }
};

/** Label derived from PRIMARY media item. Used by list rows. */
export function getMediaTypeLabelFromIntervention(item?: unknown): string {
  const m = getPrimaryMedia(item);
  if (!m) return 'None';

  switch (m.media_type) {
    case 'video':
      return 'Video';
    case 'audio':
      return 'Audio';
    case 'pdf':
      return 'PDF';
    case 'image':
      return 'Image';
    case 'streaming':
      return 'Streaming';
    case 'app':
      return 'App';
    case 'website':
      return 'Link';
    case 'text':
      return 'Text';
    default:
      return 'Link';
  }
}

/** Badge variant derived from PRIMARY media item. */
export function getBadgeVariantFromIntervention(item?: unknown): string {
  const m = getPrimaryMedia(item);
  if (!m) return 'secondary';

  switch (m.media_type) {
    case 'video':
      return 'danger';
    case 'audio':
      return 'warning';
    case 'pdf':
      return 'info';
    case 'image':
      return 'success';
    case 'streaming':
      return 'primary';
    case 'app':
      return 'dark';
    case 'website':
    case 'text':
    default:
      return 'secondary';
  }
}

/** -------- legacy helpers (still used in older components) -------- */

export const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
  const u = lower(mediaUrl || '');
  const l = lower(link || '');

  // If no file URL -> treat as external link
  if (!u) {
    if (isYouTube(l) || isVimeo(l)) return 'danger'; // video-like
    if (isSpotify(l) || isSoundCloud(l) || l.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/))
      return 'warning';
    if (l.match(/\.(pdf)(\?|$)/)) return 'info';
    if (l.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'success';
    return 'secondary';
  }

  // file URL
  if (u.match(/\.(mp4|mov|m4v|webm)(\?|$)/)) return 'danger';
  if (u.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/)) return 'warning';
  if (u.match(/\.(pdf)(\?|$)/)) return 'info';
  if (u.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'success';
  return 'secondary';
};

export const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
  const u = lower(mediaUrl || '');
  const l = lower(link || '');

  if (!u) {
    if (isYouTube(l) || isVimeo(l) || l.match(/\.(mp4|mov|m4v|webm)(\?|$)/)) return 'Video';
    if (isSpotify(l) || isSoundCloud(l) || l.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/))
      return 'Audio';
    if (l.match(/\.(pdf)(\?|$)/)) return 'PDF';
    if (l.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'Image';
    return 'Link';
  }

  if (u.match(/\.(mp4|mov|m4v|webm)(\?|$)/)) return 'Video';
  if (u.match(/\.(mp3|wav|m4a|ogg|webm)(\?|$)/)) return 'Audio';
  if (u.match(/\.(pdf)(\?|$)/)) return 'PDF';
  if (u.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/)) return 'Image';
  return 'Unknown';
};

/** ---------------- Tag colors (taxonomy-driven) ---------------- */

const TAG_ALIASES: Record<string, string> = {
  'physical aciticity': 'physical activity',
  'physical acitivity': 'physical activity',
  'physiscal activity': 'physical activity',
  dislipidemia: 'dyslipidemia',
};

const normTagKey = (s: string) => {
  const k = String(s || '')
    .trim()
    .toLowerCase();
  return TAG_ALIASES[k] || k;
};

const uniq = (arr: unknown[]) =>
  Array.from(
    new Set(
      (arr || [])
        .map((x) => String(x))
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );

export const getTaxonomyTags = (): string[] => {
  const tx = isRecord(interventionsConfig)
    ? (get(interventionsConfig, 'interventionsTaxonomy') as unknown)
    : undefined;

  const txx = isRecord(tx) ? tx : {};

  const buckets: unknown[] = [
    ...asArray(get(txx, 'topics')),
    ...asArray(get(txx, 'where')),
    ...asArray(get(txx, 'setting')),
    ...asArray(get(txx, 'cognitive_levels')),
    ...asArray(get(txx, 'physical_levels')),
    ...asArray(get(txx, 'duration_buckets')),
    ...asArray(get(txx, 'sex_specific')),
    ...asArray(get(txx, 'primary_diagnoses')),
    ...asArray(get(txx, 'input_from')),
    ...asArray(get(txx, 'original_languages')),
  ];

  return uniq(buckets).map(normTagKey);
};

export const generateTagColors = (tags: string[]) => {
  const tagColors: Record<string, string> = {};

  const uniqTags = Array.from(
    new Set((tags || []).map((t) => normTagKey(String(t))).filter(Boolean))
  );

  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };

  uniqTags.forEach((tag) => {
    const h = hash(tag);
    const hue = h % 360;
    const sat = 68;
    const lit = 42;
    tagColors[tag] = `hsl(${hue}, ${sat}%, ${lit}%)`;
  });

  return tagColors;
};

export const getTagColor = (tagColors: Record<string, string>, tag: string) => {
  const key = normTagKey(tag);
  return tagColors?.[key];
};

/** -------- languages helpers -------- */

export const toLangOpts = (raw: unknown, fallbackTitle?: string): LangOpt[] => {
  if (!raw) return [];

  // backend might send ["de","it"] OR [{language,title}]
  if (Array.isArray(raw)) {
    if (!raw.length) return [];

    if (typeof raw[0] === 'string') {
      return raw.map((l) => ({ language: String(l), title: null }));
    }

    return raw
      .map((x) => {
        if (!isRecord(x)) return null;
        return {
          language: String(get(x, 'language') ?? '').trim(),
          title: (get(x, 'title') as string) ?? null,
        } as LangOpt;
      })
      .filter((x): x is LangOpt => Boolean(x && x.language));
  }

  // single string
  if (typeof raw === 'string') return [{ language: raw, title: fallbackTitle ?? null }];

  return [];
};
