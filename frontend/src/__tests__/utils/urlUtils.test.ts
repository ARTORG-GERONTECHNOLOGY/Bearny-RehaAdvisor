import { isHttpUrl, matchesHost } from '@/utils/urlUtils';

describe('isHttpUrl', () => {
  it.each(['http://example.com', 'https://example.com', 'https://example.com/path?q=1'])(
    'returns true for %s',
    (url) => {
      expect(isHttpUrl(url)).toBe(true);
    }
  );

  it.each(['ftp://example.com', 'mailto:user@example.com', '', 'not-a-url', '/relative/path'])(
    'returns false for %s',
    (url) => {
      expect(isHttpUrl(url)).toBe(false);
    }
  );
});

describe('matchesHost', () => {
  describe('exact host match', () => {
    it('matches when hostname equals the host', () => {
      expect(matchesHost('https://youtube.com/watch?v=abc', 'youtube.com')).toBe(true);
    });

    it('matches youtu.be short links', () => {
      expect(matchesHost('https://youtu.be/abc123', 'youtu.be')).toBe(true);
    });
  });

  describe('subdomain match', () => {
    it('matches www subdomain', () => {
      expect(matchesHost('https://www.youtube.com/watch', 'youtube.com')).toBe(true);
    });

    it('matches arbitrary subdomain', () => {
      expect(matchesHost('https://music.youtube.com/', 'youtube.com')).toBe(true);
    });
  });

  describe('no false positives', () => {
    it('does not match a different domain that contains the host as a substring', () => {
      expect(matchesHost('https://evil.com/youtube.com/watch', 'youtube.com')).toBe(false);
    });

    it('does not match a domain that ends with the host string but is not a subdomain', () => {
      // "notyoutube.com" ends with "youtube.com" but is not a subdomain
      expect(matchesHost('https://notyoutube.com/', 'youtube.com')).toBe(false);
    });

    it('does not match host-in-path attack', () => {
      expect(matchesHost('https://attacker.com/youtube.com', 'youtube.com')).toBe(false);
    });

    it('does not match host-as-subdomain-of-attacker', () => {
      expect(matchesHost('https://youtube.com.attacker.com/', 'youtube.com')).toBe(false);
    });
  });

  describe('multiple hosts', () => {
    it('returns true if any host matches', () => {
      expect(matchesHost('https://youtu.be/abc', 'youtube.com', 'youtu.be')).toBe(true);
    });

    it('returns false if none match', () => {
      expect(matchesHost('https://vimeo.com/abc', 'youtube.com', 'youtu.be')).toBe(false);
    });
  });

  describe('invalid input', () => {
    it('returns false for empty string', () => {
      expect(matchesHost('', 'youtube.com')).toBe(false);
    });

    it('returns false for non-URL string', () => {
      expect(matchesHost('not-a-url', 'youtube.com')).toBe(false);
    });

    it('returns false when no hosts are provided', () => {
      expect(matchesHost('https://youtube.com')).toBe(false);
    });
  });
});
