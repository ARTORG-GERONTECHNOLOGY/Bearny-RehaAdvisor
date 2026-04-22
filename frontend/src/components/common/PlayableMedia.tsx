import React, { useMemo, useState } from 'react';
import ReactPlayer from 'react-player';
import ReactAudioPlayer from 'react-audio-player';
import OpenExternalIcon from '@/assets/icons/open-external-fill.svg?react';
import { isHttpUrl } from '@/utils/urlUtils';

export type Media = {
  kind: 'external' | 'file';
  media_type: 'audio' | 'video' | 'image' | 'pdf' | 'website' | 'app' | 'streaming' | 'text';
  url?: string | null;
  embed_url?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  title?: string | null;
  provider?: string | null;
};

const extOf = (u: string) => {
  try {
    const p = new URL(u).pathname.toLowerCase();
    const m = p.match(/\.([a-z0-9]{2,5})$/);
    return m?.[1] || '';
  } catch {
    return '';
  }
};

const isDirectAudio = (u: string) =>
  ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'].includes(extOf(u));
const isDirectVideo = (u: string) => ['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(extOf(u));

const OpenLinkButton: React.FC<{ href: string; text?: string }> = ({
  href,
  text = 'Open link',
}) => (
  <div className="mt-2">
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-full p-4 pl-5 bg-brand flex gap-2 items-center justify-center text-zinc-50 font-medium text-lg no-underline"
    >
      {text}
      <OpenExternalIcon className="w-6 h-6" aria-hidden="true" />
    </a>
  </div>
);

export const PlayableMedia: React.FC<{
  m: Media;
  label: string;
  openText?: string;
  showOpenLink?: boolean;
}> = ({ m, label, openText = 'Open link', showOpenLink = true }) => {
  const [mode, setMode] = useState<'iframe' | 'reactplayer' | 'native' | 'link'>(() =>
    m.embed_url ? 'iframe' : 'reactplayer'
  );

  // Pick the best "openable" link for the button
  const linkUrl = useMemo(() => {
    const u = (m.url || m.embed_url || m.file_url || m.file_path || '').trim();
    return u && isHttpUrl(u) ? u : '';
  }, [m]);

  if (!linkUrl) {
    return <div className="text-muted small">No playable URL available.</div>;
  }

  const openLink = showOpenLink ? <OpenLinkButton href={linkUrl} text={openText} /> : null;

  // Final fallback
  if (mode === 'link') return openLink;

  // 1) iframe (best for embed URLs like Spotify/ARD/YouTube embed)
  if (mode === 'iframe') {
    const src = (m.embed_url || '').trim();
    if (!src || !isHttpUrl(src)) {
      setTimeout(() => setMode('reactplayer'), 0);
      return null;
    }

    return (
      <div>
        <div style={{ position: 'relative', paddingTop: '56.25%' }}>
          <iframe
            title={label}
            src={src}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
            onError={() => setMode('reactplayer')}
            className="border-none rounded-3xl"
          />
        </div>
        {openLink}
      </div>
    );
  }

  // 2) ReactPlayer (works for many provider pages)
  if (mode === 'reactplayer') {
    const rpUrl = (m.url || m.embed_url || '').trim();
    if (!rpUrl || !isHttpUrl(rpUrl)) {
      setTimeout(() => setMode('native'), 0);
      return null;
    }

    return (
      <div>
        <ReactPlayer
          url={rpUrl}
          width="100%"
          height="auto"
          controls
          onError={() => setMode('native')}
        />
        {openLink}
      </div>
    );
  }

  // 3) Native (ONLY for direct media files)
  if (mode === 'native') {
    const u = (m.file_url || m.file_path || m.url || '').trim();
    if (!u || !isHttpUrl(u)) {
      setTimeout(() => setMode('link'), 0);
      return null;
    }

    if (isDirectAudio(u)) {
      return (
        <div>
          <ReactAudioPlayer
            src={u}
            controls
            style={{ width: '100%' }}
            onError={() => setMode('link')}
          />
          {openLink}
        </div>
      );
    }

    if (isDirectVideo(u)) {
      return (
        <div>
          <video
            src={u}
            controls
            style={{ width: '100%', borderRadius: 12 }}
            onError={() => setMode('link')}
          />
          {openLink}
        </div>
      );
    }

    setTimeout(() => setMode('link'), 0);
    return null;
  }

  return openLink;
};
