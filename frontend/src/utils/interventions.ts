// src/utils/interventions.ts

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
  file_url?: string | null; // ✅ from BE
  mime?: string | null;

  thumbnail?: string | null;
};

export function getAllMedia(item?: any): InterventionMedia[] {
  const list = item?.media;
  return Array.isArray(list) ? list : [];
}

export function getPrimaryMedia(item?: any): InterventionMedia | null {
  const list = getAllMedia(item);
  return list.length ? list[0] : null;
}

export function getPlayableUrl(m?: InterventionMedia | null): string {
  if (!m) return '';
  if (m.kind === 'file') return String(m.file_url || '');
  return String(m.embed_url || m.url || '');
}

export function getMediaTypeLabelFromIntervention(item?: any): string {
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

export function getBadgeVariantFromIntervention(item?: any): string {
  const m = getPrimaryMedia(item);
  if (!m) return 'secondary';

  switch (m.media_type) {
    case 'video':
      return 'danger';
    case 'audio':
      return 'warning';
    case 'pdf':
      return 'primary';
    case 'image':
      return 'info';
    case 'streaming':
      return 'success';
    case 'app':
      return 'dark';
    case 'website':
    case 'text':
    default:
      return 'secondary';
  }
}
//utils/interventions.ts
export const getBadgeVariantFromUrl = (mediaUrl: string, link: string) => {
  if (!mediaUrl) {
    // Helper function to check if a URL contains a domain
    const isDomain = (url: string, domain: string) => url.includes(domain);
    // Check for iframe-compatible links (e.g., YouTube, Vimeo)
    if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'primary';
    if (isDomain(link, 'vimeo.com')) return 'primary';

    return 'warning'; // Link
  }

  if (mediaUrl.endsWith('.mp4')) return 'primary';
  if (mediaUrl.endsWith('.mp3')) return 'info';
  if (mediaUrl.endsWith('.pdf')) return 'danger';
  if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png'))
    return 'success';

  return 'secondary'; // Default for unknown file types
};
// Function to generate color spectrum based on available tags
export const generateTagColors = (tags: string[]) => {
  const tagColors: Record<string, string> = {};

  tags.forEach((tag, index) => {
    const hue = (index * 360) / tags.length; // Spread colors evenly in HSL spectrum
    tagColors[tag] = `hsl(${hue}, 70%, 50%)`; // Generate HSL color
  });

  return tagColors;
};

export const getMediaTypeLabelFromUrl = (mediaUrl: string, link: string) => {
  if (!mediaUrl) {
    // Helper function to check if a URL contains a domain
    const isDomain = (url: string, domain: string) => url.includes(domain);

    // Check for iframe-compatible links (e.g., YouTube, Vimeo)
    if (isDomain(link, 'youtube.com') || isDomain(link, 'youtu.be')) return 'Video';
    if (isDomain(link, 'vimeo.com')) return 'Video';
    if (link.endsWith('.mp4')) return 'Video';
    if (link.endsWith('.mp4')) return 'Video';
    if (link.endsWith('.mp3')) return 'Audio';
    if (link.endsWith('.pdf')) return 'PDF';

    return 'Link';
  }

  if (mediaUrl.endsWith('.mp4')) return 'Video';
  if (mediaUrl.endsWith('.mp3')) return 'Audio';
  if (mediaUrl.endsWith('.pdf')) return 'PDF';
  if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png'))
    return 'Image';

  return 'Unknown';
};