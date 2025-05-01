import {
  getBadgeVariantFromUrl,
  getMediaTypeLabelFromUrl,
  generateTagColors,
} from '../../utils/interventions';

describe('getBadgeVariantFromUrl', () => {
  it.each([
    ['.mp4', '', 'primary'],
    ['.mp3', '', 'info'],
    ['.pdf', '', 'danger'],
    ['.jpg', '', 'success'],
    ['.jpeg', '', 'success'],
    ['.png', '', 'success'],
    ['.xyz', '', 'secondary'],
  ])('returns correct badge for %s', (ext, link, expected) => {
    expect(getBadgeVariantFromUrl(`file${ext}`, link)).toBe(expected);
  });

  it.each([
    ['https://youtube.com/watch?v=abc', 'primary'],
    ['https://youtu.be/xyz', 'primary'],
    ['https://vimeo.com/abc', 'primary'],
    ['https://unknown.com/page', 'warning'],
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
      expect(result[tag]).toMatch(/^hsl\(\d+, 70%, 50%\)$/);
    });
  });

  it('spreads hues evenly', () => {
    const tags = ['a', 'b', 'c', 'd'];
    const result = generateTagColors(tags);
    const hues = Object.values(result).map((color) => parseInt(color.match(/\d+/)?.[0] ?? '0'));
    expect(new Set(hues).size).toBe(tags.length); // Unique hues
  });
});
