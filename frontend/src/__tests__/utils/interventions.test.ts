import {
  getBadgeVariantFromUrl,
  getMediaTypeLabelFromUrl,
  generateTagColors,
  guessMediaTypeFromFilePath,
  guessMediaTypeFromUrl,
  guessProvider,
  getAllMedia,
  getPrimaryMedia,
  getPlayableUrl,
  getMediaBadge,
  getMediaTypeLabelFromIntervention,
  getBadgeVariantFromIntervention,
  toLangOpts,
} from '@/utils/interventions';
import type { InterventionMedia } from '@/utils/interventions';

describe('getBadgeVariantFromUrl', () => {
  it.each([
    ['.mp4', '', 'danger'],
    ['.mp3', '', 'warning'],
    ['.pdf', '', 'info'],
    ['.jpg', '', 'success'],
    ['.jpeg', '', 'success'],
    ['.png', '', 'success'],
    ['.xyz', '', 'secondary'],
  ])('returns correct badge for %s', (ext, link, expected) => {
    expect(getBadgeVariantFromUrl(`file${ext}`, link)).toBe(expected);
  });

  it.each([
    ['https://youtube.com/watch?v=abc', 'danger'],
    ['https://youtu.be/xyz', 'danger'],
    ['https://vimeo.com/abc', 'danger'],
    ['https://unknown.com/page', 'secondary'],
  ])('returns correct badge for iframe links: %s', (link, expected) => {
    expect(getBadgeVariantFromUrl('', link)).toBe(expected);
  });
});

describe('getMediaTypeLabelFromUrl', () => {
  it.each([
    ['.mp4', '', 'Video'],
    ['.mp3', '', 'Audio'],
    ['.pdf', '', 'PDF'],
    ['.jpg', '', 'Image'],
    ['.png', '', 'Image'],
    ['.weird', '', 'Unknown'],
  ])('returns correct label for %s', (ext, link, expected) => {
    expect(getMediaTypeLabelFromUrl(`media${ext}`, link)).toBe(expected);
  });

  it.each([
    ['https://youtube.com/watch?v=abc', 'Video'],
    ['https://youtu.be/xyz', 'Video'],
    ['https://vimeo.com/abc', 'Video'],
    ['https://example.com/file.mp4', 'Video'],
    ['https://example.com/file.mp3', 'Audio'],
    ['https://example.com/file.pdf', 'PDF'],
    ['https://example.com/file.txt', 'Link'],
  ])('returns correct label for link-only: %s', (link, expected) => {
    expect(getMediaTypeLabelFromUrl('', link)).toBe(expected);
  });
});

describe('generateTagColors', () => {
  it('generates consistent HSL values for tags', () => {
    const tags = ['balance', 'strength', 'flexibility'];
    const result = generateTagColors(tags);
    expect(Object.keys(result)).toEqual(tags);
    tags.forEach((tag) => {
      expect(result[tag]).toMatch(/^hsl\(\d+, 68%, 42%\)$/);
    });
  });

  it('spreads hues evenly', () => {
    const tags = ['a', 'b', 'c', 'd'];
    const result = generateTagColors(tags);
    const hues = Object.values(result).map((color) => parseInt(color.match(/\d+/)?.[0] ?? '0'));
    expect(new Set(hues).size).toBe(tags.length); // Unique hues
  });
});

// ─── guessMediaTypeFromFilePath ───────────────────────────────────────────────

describe('guessMediaTypeFromFilePath', () => {
  it('returns "text" for empty path', () => {
    expect(guessMediaTypeFromFilePath('')).toBe('text');
  });
  it.each([
    ['file.mp3', 'audio'],
    ['file.wav', 'audio'],
    ['file.m4a', 'audio'],
    ['file.mp4', 'video'],
    ['file.mov', 'video'],
    ['file.m4v', 'video'],
    ['file.pdf', 'pdf'],
    ['file.png', 'image'],
    ['file.jpg', 'image'],
    ['file.webp', 'image'],
    ['file.txt', 'text'],
  ])('returns correct type for %s', (path, expected) => {
    expect(guessMediaTypeFromFilePath(path)).toBe(expected);
  });
});

// ─── guessMediaTypeFromUrl ────────────────────────────────────────────────────

describe('guessMediaTypeFromUrl', () => {
  it('returns "website" for empty url', () => {
    expect(guessMediaTypeFromUrl('')).toBe('website');
  });
  it.each([
    ['https://open.spotify.com/track/abc', 'streaming'],
    ['https://www.youtube.com/watch?v=abc', 'video'],
    ['https://youtu.be/abc', 'video'],
    ['https://vimeo.com/abc', 'video'],
    ['https://soundcloud.com/artist/track', 'audio'],
    ['https://example.com/song.mp3', 'audio'],
    ['https://example.com/song.wav', 'audio'],
    ['https://example.com/clip.mp4', 'video'],
    ['https://example.com/clip.mov', 'video'],
    ['https://example.com/doc.pdf', 'pdf'],
    ['https://example.com/photo.png', 'image'],
    ['https://example.com/photo.jpg', 'image'],
    ['https://example.com/page', 'website'],
  ])('returns correct type for %s', (url, expected) => {
    expect(guessMediaTypeFromUrl(url)).toBe(expected);
  });
});

// ─── guessProvider ────────────────────────────────────────────────────────────

describe('guessProvider', () => {
  it('returns "website" for empty url', () => {
    expect(guessProvider('')).toBe('website');
  });
  it.each([
    ['https://open.spotify.com/track/abc', 'spotify'],
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://soundcloud.com/artist/track', 'soundcloud'],
    ['https://vimeo.com/abc', 'vimeo'],
    ['https://example.com/page', 'website'],
  ])('returns correct provider for %s', (url, expected) => {
    expect(guessProvider(url)).toBe(expected);
  });
});

// ─── getAllMedia ──────────────────────────────────────────────────────────────

describe('getAllMedia', () => {
  it('returns [] for undefined', () => {
    expect(getAllMedia(undefined)).toEqual([]);
  });

  it('returns [] for item with no media or links', () => {
    expect(getAllMedia({})).toEqual([]);
  });

  describe('new model (media array)', () => {
    it('parses external media with explicit media_type', () => {
      const item = {
        media: [{ kind: 'external', url: 'https://youtube.com/watch?v=x', media_type: 'video' }],
      };
      const result = getAllMedia(item);
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('external');
      expect(result[0].media_type).toBe('video');
      expect(result[0].url).toBe('https://youtube.com/watch?v=x');
    });

    it('guesses media_type for external media when not provided', () => {
      const item = {
        media: [{ kind: 'external', url: 'https://open.spotify.com/track/abc' }],
      };
      const [m] = getAllMedia(item);
      expect(m.media_type).toBe('streaming');
    });

    it('parses file media with file_url', () => {
      const item = {
        media: [
          { kind: 'file', file_url: 'https://cdn.example.com/audio.mp3', mime: 'audio/mpeg' },
        ],
      };
      const [m] = getAllMedia(item);
      expect(m.kind).toBe('file');
      expect(m.file_url).toBe('https://cdn.example.com/audio.mp3');
      expect(m.mime).toBe('audio/mpeg');
    });

    it('guesses media_type for file media from file_url when media_type absent', () => {
      const item = {
        media: [{ kind: 'file', file_url: 'https://cdn.example.com/clip.mp4' }],
      };
      const [m] = getAllMedia(item);
      expect(m.media_type).toBe('video');
    });

    it('filters out non-record entries in media array', () => {
      const item = { media: [null, 'string', { kind: 'external', url: 'https://example.com' }] };
      const result = getAllMedia(item);
      expect(result).toHaveLength(1);
    });

    it('supports camelCase aliases (embedUrl, fileUrl, filePath)', () => {
      const item = {
        media: [
          {
            kind: 'external',
            embedUrl: 'https://open.spotify.com/embed/track/abc',
            mediaType: 'streaming',
          },
        ],
      };
      const [m] = getAllMedia(item);
      expect(m.embed_url).toBe('https://open.spotify.com/embed/track/abc');
      expect(m.media_type).toBe('streaming');
    });
  });

  describe('legacy fallback', () => {
    it('uses link field when no media array', () => {
      const item = { link: 'https://youtube.com/watch?v=abc' };
      const result = getAllMedia(item);
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('external');
      expect(result[0].media_type).toBe('video');
    });

    it('uses media_url field as file when it is an absolute URL', () => {
      const item = { media_url: 'https://cdn.example.com/file.mp3' };
      const result = getAllMedia(item);
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('file');
      expect(result[0].file_url).toBe('https://cdn.example.com/file.mp3');
    });

    it('uses media_file field as file_path when media_url is not an HTTP URL', () => {
      const item = { media_file: 'uploads/document.pdf' };
      const result = getAllMedia(item);
      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('file');
      expect(result[0].file_path).toBe('uploads/document.pdf');
      expect(result[0].media_type).toBe('pdf');
    });

    it('ignores link that is not an HTTP URL', () => {
      const item = { link: 'not-a-url' };
      expect(getAllMedia(item)).toHaveLength(0);
    });
  });
});

// ─── getPrimaryMedia ──────────────────────────────────────────────────────────

describe('getPrimaryMedia', () => {
  it('returns null for undefined item', () => {
    expect(getPrimaryMedia(undefined)).toBeNull();
  });

  it('returns null for item with no media', () => {
    expect(getPrimaryMedia({})).toBeNull();
  });

  it('returns the first media item', () => {
    const item = {
      media: [
        { kind: 'external', url: 'https://youtube.com/watch?v=a', media_type: 'video' },
        { kind: 'external', url: 'https://example.com', media_type: 'website' },
      ],
    };
    const m = getPrimaryMedia(item);
    expect(m?.media_type).toBe('video');
  });
});

// ─── getPlayableUrl ───────────────────────────────────────────────────────────

describe('getPlayableUrl', () => {
  it('returns empty string for null', () => {
    expect(getPlayableUrl(null)).toBe('');
  });

  it('returns embed_url for spotify streaming', () => {
    const m: InterventionMedia = {
      kind: 'external',
      media_type: 'streaming',
      provider: 'spotify',
      url: 'https://open.spotify.com/track/abc',
      embed_url: 'https://open.spotify.com/embed/track/abc',
    };
    expect(getPlayableUrl(m)).toBe('https://open.spotify.com/embed/track/abc');
  });

  it('returns url for external non-spotify', () => {
    const m: InterventionMedia = {
      kind: 'external',
      media_type: 'video',
      url: 'https://youtube.com/watch?v=x',
    };
    expect(getPlayableUrl(m)).toBe('https://youtube.com/watch?v=x');
  });

  it('returns file_url for file kind when available', () => {
    const m: InterventionMedia = {
      kind: 'file',
      media_type: 'audio',
      file_url: 'https://cdn.example.com/audio.mp3',
      file_path: 'uploads/audio.mp3',
    };
    expect(getPlayableUrl(m)).toBe('https://cdn.example.com/audio.mp3');
  });

  it('returns file_path for file kind when file_url is absent', () => {
    const m: InterventionMedia = {
      kind: 'file',
      media_type: 'pdf',
      file_path: 'uploads/doc.pdf',
    };
    expect(getPlayableUrl(m)).toBe('uploads/doc.pdf');
  });
});

// ─── getMediaBadge ────────────────────────────────────────────────────────────

describe('getMediaBadge', () => {
  it('returns "No media" for empty array', () => {
    expect(getMediaBadge([])).toEqual({ label: 'No media', variant: 'secondary' });
  });

  it('returns "Mixed" for multiple media types', () => {
    const media: InterventionMedia[] = [
      { kind: 'external', media_type: 'video' },
      { kind: 'external', media_type: 'audio' },
    ];
    expect(getMediaBadge(media)).toEqual({ label: 'Mixed', variant: 'primary' });
  });

  it.each([
    ['video', { label: 'Video', variant: 'danger' }],
    ['audio', { label: 'Audio', variant: 'warning' }],
    ['streaming', { label: 'Audio', variant: 'warning' }],
    ['pdf', { label: 'PDF', variant: 'info' }],
    ['image', { label: 'Image', variant: 'success' }],
    ['app', { label: 'App', variant: 'dark' }],
    ['website', { label: 'Link', variant: 'secondary' }],
    ['text', { label: 'Link', variant: 'secondary' }],
  ] as [InterventionMedia['media_type'], { label: string; variant: string }][])(
    'returns correct badge for single %s type',
    (media_type, expected) => {
      expect(getMediaBadge([{ kind: 'external', media_type }])).toEqual(expected);
    }
  );
});

// ─── getMediaTypeLabelFromIntervention ────────────────────────────────────────

describe('getMediaTypeLabelFromIntervention', () => {
  it('returns "None" when no media', () => {
    expect(getMediaTypeLabelFromIntervention({})).toBe('None');
  });

  it.each([
    ['video', 'Video'],
    ['audio', 'Audio'],
    ['pdf', 'PDF'],
    ['image', 'Image'],
    ['streaming', 'Streaming'],
    ['app', 'App'],
    ['website', 'Link'],
    ['text', 'Text'],
  ] as [InterventionMedia['media_type'], string][])(
    'returns "%s" label for %s media type',
    (media_type, expected) => {
      const item = { media: [{ kind: 'external', media_type, url: 'https://example.com' }] };
      expect(getMediaTypeLabelFromIntervention(item)).toBe(expected);
    }
  );
});

// ─── getBadgeVariantFromIntervention ─────────────────────────────────────────

describe('getBadgeVariantFromIntervention', () => {
  it('returns "secondary" when no media', () => {
    expect(getBadgeVariantFromIntervention({})).toBe('secondary');
  });

  it.each([
    ['video', 'danger'],
    ['audio', 'warning'],
    ['pdf', 'info'],
    ['image', 'success'],
    ['streaming', 'primary'],
    ['app', 'dark'],
    ['website', 'secondary'],
    ['text', 'secondary'],
  ] as [InterventionMedia['media_type'], string][])(
    'returns "%s" variant for %s media type',
    (media_type, expected) => {
      const item = { media: [{ kind: 'external', media_type, url: 'https://example.com' }] };
      expect(getBadgeVariantFromIntervention(item)).toBe(expected);
    }
  );
});

// ─── toLangOpts ───────────────────────────────────────────────────────────────

describe('toLangOpts', () => {
  it('returns [] for null/undefined', () => {
    expect(toLangOpts(null)).toEqual([]);
    expect(toLangOpts(undefined)).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(toLangOpts([])).toEqual([]);
  });

  it('converts array of strings', () => {
    expect(toLangOpts(['de', 'en'])).toEqual([
      { language: 'de', title: null },
      { language: 'en', title: null },
    ]);
  });

  it('converts array of objects', () => {
    const raw = [
      { language: 'de', title: 'Deutsch' },
      { language: 'en', title: null },
    ];
    expect(toLangOpts(raw)).toEqual([
      { language: 'de', title: 'Deutsch' },
      { language: 'en', title: null },
    ]);
  });

  it('filters out object entries with empty language', () => {
    const raw = [
      { language: '', title: 'None' },
      { language: 'fr', title: 'Français' },
    ];
    const result = toLangOpts(raw);
    expect(result).toHaveLength(1);
    expect(result[0].language).toBe('fr');
  });

  it('filters out non-record entries in object arrays', () => {
    const raw = [null, { language: 'it', title: null }];
    const result = toLangOpts(raw);
    expect(result).toHaveLength(1);
  });

  it('converts a single string with optional fallback title', () => {
    expect(toLangOpts('de', 'Deutsch')).toEqual([{ language: 'de', title: 'Deutsch' }]);
    expect(toLangOpts('en')).toEqual([{ language: 'en', title: null }]);
  });
});
