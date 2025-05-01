import {
  getBadgeVariantFromUrl,
  getMediaTypeLabelFromUrl,
  generateTagColors,
} from '../utils/interventions';

describe('getBadgeVariantFromUrl', () => {
  test('should return primary for YouTube links', () => {
    expect(getBadgeVariantFromUrl('', 'https://www.youtube.com/watch?v=abc123')).toBe('primary');
  });

  test('should return danger for PDF files', () => {
    expect(getBadgeVariantFromUrl('document.pdf', '')).toBe('danger');
  });

  test('should return success for images', () => {
    expect(getBadgeVariantFromUrl('image.jpg', '')).toBe('success');
  });
});

describe('getMediaTypeLabelFromUrl', () => {
  test('should return Video for Vimeo links', () => {
    expect(getMediaTypeLabelFromUrl('', 'https://vimeo.com/123456')).toBe('Video');
  });

  test('should return PDF for PDF files', () => {
    expect(getMediaTypeLabelFromUrl('document.pdf', '')).toBe('PDF');
  });

  test('should return Image for images', () => {
    expect(getMediaTypeLabelFromUrl('image.png', '')).toBe('Image');
  });
});

describe('generateTagColors', () => {
  test('should generate unique colors for tags', () => {
    const tags = ['Exercise', 'Diet', 'Mental Health'];
    const colors = generateTagColors(tags);
    expect(Object.keys(colors)).toEqual(tags);
    expect(colors['Exercise']).toMatch(/^hsl\(\d+, 70%, 50%\)$/); // HSL format
  });
});
