import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PlayableMedia, Media } from '@/components/common/PlayableMedia';

jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock(
  'react-player',
  () =>
    function ReactPlayer(props: any) {
      // A real <video> tag (not a <div>) so fireEvent.error can genuinely exercise
      // onError — React only wires up capture-phase 'error' listening for media-like
      // elements, not arbitrary divs.
      return <video data-testid="video-player" data-url={props.url} onError={props.onError} />;
    }
);
jest.mock(
  'react-audio-player',
  () =>
    function ReactAudioPlayer(props: any) {
      return <audio data-testid="audio-player" data-src={props.src} onError={props.onError} />;
    }
);

const baseMedia = (overrides: Partial<Media> = {}): Media => ({
  kind: 'external',
  media_type: 'video',
  ...overrides,
});

describe('PlayableMedia', () => {
  // ------------------------------------------------------------------
  // No playable URL
  // ------------------------------------------------------------------
  describe('no playable URL', () => {
    it('shows a fallback message when no usable URL is present', () => {
      render(<PlayableMedia m={baseMedia({ url: '' })} label="Video" />);
      expect(screen.getByText('No playable URL available.')).toBeInTheDocument();
    });

    it('shows the fallback message for a non-http URL', () => {
      render(<PlayableMedia m={baseMedia({ url: 'ftp://example.com/file' })} label="Video" />);
      expect(screen.getByText('No playable URL available.')).toBeInTheDocument();
    });

    it('picks up file_path as the link URL when url/embed_url/file_url are absent', () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: '', file_path: 'https://cdn.example.com/doc.pdf' })}
          label="Doc"
        />
      );
      // No embed_url -> starts in reactplayer mode -> falls through to native -> falls to link
      return waitFor(() => {
        expect(screen.getByRole('link', { name: /Open link/i })).toHaveAttribute(
          'href',
          'https://cdn.example.com/doc.pdf'
        );
      });
    });
  });

  // ------------------------------------------------------------------
  // iframe mode (embed_url present)
  // ------------------------------------------------------------------
  describe('iframe mode', () => {
    it('renders an iframe for a valid embed_url', () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: 'https://example.com/x', embed_url: 'https://embed.example.com/x' })}
          label="My Video"
        />
      );
      const iframe = screen.getByTitle('My Video');
      expect(iframe.tagName).toBe('IFRAME');
      expect(iframe).toHaveAttribute('src', 'https://embed.example.com/x');
    });

    it('shows the Open link button using the preferred (plain url) link target', () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: 'https://example.com/x', embed_url: 'https://embed.example.com/x' })}
          label="Video"
        />
      );
      expect(screen.getByRole('link', { name: /Open link/i })).toHaveAttribute(
        'href',
        'https://example.com/x'
      );
    });

    it('hides the Open link button when showOpenLink is false', () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: 'https://example.com/x', embed_url: 'https://embed.example.com/x' })}
          label="Video"
          showOpenLink={false}
        />
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('uses a custom openText label for the Open link button', () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: 'https://example.com/x', embed_url: 'https://embed.example.com/x' })}
          label="Video"
          openText="Open in Spotify"
        />
      );
      expect(screen.getByRole('link', { name: /Open in Spotify/i })).toBeInTheDocument();
    });

    it('falls through to reactplayer mode when embed_url is not a valid http URL', async () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: 'https://example.com/x', embed_url: 'not-a-url' })}
          label="Video"
        />
      );
      expect(await screen.findByTestId('video-player')).toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // reactplayer mode (no embed_url)
  // ------------------------------------------------------------------
  describe('reactplayer mode', () => {
    it('renders ReactPlayer with the media URL', () => {
      render(<PlayableMedia m={baseMedia({ url: 'https://example.com/video' })} label="Video" />);
      expect(screen.getByTestId('video-player')).toHaveAttribute(
        'data-url',
        'https://example.com/video'
      );
    });

    it('shows the Open link button next to the player', () => {
      render(<PlayableMedia m={baseMedia({ url: 'https://example.com/video' })} label="Video" />);
      expect(screen.getByRole('link', { name: /Open link/i })).toBeInTheDocument();
    });

    it('falls through to native mode when neither url nor embed_url is usable', async () => {
      render(
        <PlayableMedia
          m={baseMedia({ url: '', file_url: 'https://cdn.example.com/clip.mp4' })}
          label="Video"
        />
      );
      await waitFor(() => {
        expect(document.querySelector('video')).toBeInTheDocument();
      });
    });
  });

  // ------------------------------------------------------------------
  // native mode (direct file playback) — reached once url/embed_url are unusable
  // ------------------------------------------------------------------
  describe('native mode', () => {
    it('renders a native <video> for a direct video file', async () => {
      const { container } = render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'video',
            url: '',
            file_url: 'https://cdn.example.com/clip.mp4',
          })}
          label="Video"
        />
      );
      await waitFor(() => {
        expect(container.querySelector('video')).toHaveAttribute(
          'src',
          'https://cdn.example.com/clip.mp4'
        );
      });
    });

    it('renders a ReactAudioPlayer for a direct audio file', async () => {
      render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'audio',
            url: '',
            file_path: 'https://cdn.example.com/clip.mp3',
          })}
          label="Audio"
        />
      );
      await waitFor(() => {
        expect(screen.getByTestId('audio-player')).toHaveAttribute(
          'data-src',
          'https://cdn.example.com/clip.mp3'
        );
      });
    });

    it('prefers file_url over file_path and the plain url for native playback', async () => {
      const { container } = render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'video',
            url: '',
            file_path: 'https://cdn.example.com/ignored.mp4',
            file_url: 'https://cdn.example.com/preferred.mp4',
          })}
          label="Video"
        />
      );
      await waitFor(() => {
        expect(container.querySelector('video')).toHaveAttribute(
          'src',
          'https://cdn.example.com/preferred.mp4'
        );
      });
    });

    it('falls back to the link view for a non-media direct file extension', async () => {
      render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'pdf',
            url: '',
            file_url: 'https://cdn.example.com/doc.pdf',
          })}
          label="Doc"
        />
      );
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Open link/i })).toBeInTheDocument();
      });
      expect(document.querySelector('video')).not.toBeInTheDocument();
      expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();
    });
  });

  // ------------------------------------------------------------------
  // error-recovery transitions between playback modes
  // ------------------------------------------------------------------
  describe('error recovery falls through reactplayer -> native -> link', () => {
    it('falls back to reactplayer when the ReactPlayer itself reports an error', async () => {
      const m = baseMedia({ url: 'https://example.com/x', file_url: '' });
      render(<PlayableMedia m={m} label="Video" />);

      const player = await screen.findByTestId('video-player');
      fireEvent.error(player);

      // native mode's `u` (file_url/file_path/url) resolves to the same plain url,
      // which is not a direct audio/video file extension, so it falls to the link view.
      await waitFor(() => {
        expect(screen.queryByTestId('video-player')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open link/i })).toBeInTheDocument();
      });
    });

    it('falls back to the link view when the native <video> element reports an error', async () => {
      render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'video',
            url: '',
            file_url: 'https://cdn.example.com/clip.mp4',
          })}
          label="Video"
        />
      );

      await waitFor(() => {
        expect(document.querySelector('video')).toBeTruthy();
      });
      fireEvent.error(document.querySelector('video')!);

      await waitFor(() => {
        expect(document.querySelector('video')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open link/i })).toBeInTheDocument();
      });
    });

    it('falls back to the link view when the native audio player reports an error', async () => {
      render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'audio',
            url: '',
            file_url: 'https://cdn.example.com/clip.mp3',
          })}
          label="Audio"
        />
      );

      const audio = await screen.findByTestId('audio-player');
      fireEvent.error(audio);

      await waitFor(() => {
        expect(screen.queryByTestId('audio-player')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Open link/i })).toBeInTheDocument();
      });
    });
  });

  // ------------------------------------------------------------------
  // link-only fallback (no reactplayer-able url, no direct file)
  // ------------------------------------------------------------------
  describe('link fallback', () => {
    it('renders only the Open link button when nothing else is playable', async () => {
      render(
        <PlayableMedia
          m={baseMedia({
            kind: 'file',
            media_type: 'website',
            url: '',
            file_url: 'https://example.com/page.html',
          })}
          label="Page"
        />
      );
      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Open link/i })).toHaveAttribute(
          'href',
          'https://example.com/page.html'
        );
      });
    });
  });
});
