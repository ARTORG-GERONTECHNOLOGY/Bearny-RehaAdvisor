const SVG_NS = 'http://www.w3.org/2000/svg';

import {
  isInRange,
  eachDateInRange,
  buildDailyRows,
  averageNonNull,
  toEuroDate,
  formatDateEU,
  thresholdTier,
  worstTier,
  svgToImageDataUrl,
} from '@/utils/healthCharts';
import * as dateFormat from '@/utils/dateFormat';

const makeSvg = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  document.body.appendChild(svg);
  return svg;
};

describe('isInRange', () => {
  it('is true when no bounds are given', () => {
    expect(isInRange('2024-01-01')).toBe(true);
  });

  it('respects start and end bounds', () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-31');
    expect(isInRange('2024-01-15', start, end)).toBe(true);
    expect(isInRange('2023-12-31', start, end)).toBe(false);
    expect(isInRange('2024-02-01', start, end)).toBe(false);
  });
});

describe('eachDateInRange', () => {
  it('is inclusive of both endpoints', () => {
    const start = new Date(2024, 0, 29);
    const end = new Date(2024, 1, 1);
    expect(eachDateInRange(start, end)).toEqual([
      '2024-01-29',
      '2024-01-30',
      '2024-01-31',
      '2024-02-01',
    ]);
  });

  it('returns a single date when start equals end', () => {
    const d = new Date(2024, 5, 15);
    expect(eachDateInRange(d, d)).toEqual(['2024-06-15']);
  });
});

describe('buildDailyRows', () => {
  type Entry = { date: string; steps: number };
  const data: Entry[] = [
    { date: '2024-01-01', steps: 100 },
    { date: '2024-01-03', steps: 300 },
  ];

  it('fills gaps in the range with null instead of skipping them', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 3);
    expect(buildDailyRows(data, start, end, 'steps', (d) => d.steps)).toEqual([
      { date: '2024-01-01', steps: 100 },
      { date: '2024-01-02', steps: null },
      { date: '2024-01-03', steps: 300 },
    ]);
  });

  it('falls back to sorted data dates when no range is given', () => {
    const unsorted: Entry[] = [
      { date: '2024-01-03', steps: 300 },
      { date: '2024-01-01', steps: 100 },
    ];
    expect(buildDailyRows(unsorted, null, null, 'steps', (d) => d.steps)).toEqual([
      { date: '2024-01-01', steps: 100 },
      { date: '2024-01-03', steps: 300 },
    ]);
  });

  it('lets the accessor decide a null value even for a day with data', () => {
    const start = new Date(2024, 0, 1);
    const end = new Date(2024, 0, 1);
    const rows = buildDailyRows(data, start, end, 'steps', () => null);
    expect(rows).toEqual([{ date: '2024-01-01', steps: null }]);
  });
});

describe('averageNonNull', () => {
  it('averages only the non-null values', () => {
    expect(averageNonNull([10, null, 20, undefined, 30])).toBe(20);
  });

  it('returns null when every value is null or undefined', () => {
    expect(averageNonNull([null, undefined])).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(averageNonNull([])).toBeNull();
  });

  it('treats 0 as a real value, not a missing one', () => {
    expect(averageNonNull([0, 10])).toBe(5);
  });
});

describe('toEuroDate', () => {
  it('converts YYYY-MM-DD to DD.MM.YYYY', () => {
    expect(toEuroDate('2024-03-07')).toBe('07.03.2024');
  });

  it('returns an empty string for null/undefined input', () => {
    expect(toEuroDate(null)).toBe('');
    expect(toEuroDate(undefined)).toBe('');
  });

  it('returns the input unchanged when it has no date-like structure', () => {
    expect(toEuroDate('notadate')).toBe('notadate');
  });
});

describe('formatDateEU', () => {
  it('formats a local calendar date as DD.MM.YYYY', () => {
    // Local midnight construction, same as store.startDate/endDate — TZ-independent.
    expect(formatDateEU(new Date(2024, 2, 7))).toBe('07.03.2024');
  });

  it('delegates to the local-calendar-day helper, not a UTC-based conversion', () => {
    // Regression guard for the toISOString() day-rollback bug; TZ-independent (see usePatientProcess.test.tsx).
    const spy = jest.spyOn(dateFormat, 'toLocalYMD');
    const d = new Date(2026, 6, 1);

    formatDateEU(d);

    expect(spy).toHaveBeenCalledWith(d);
    spy.mockRestore();
  });
});

describe('thresholdTier', () => {
  it('returns null when there is no value', () => {
    expect(thresholdTier(null, 30, 20, true)).toBeNull();
    expect(thresholdTier(undefined, 30, 20, true)).toBeNull();
  });

  it('returns green when there is no green threshold to fail', () => {
    expect(thresholdTier(5, null, 20, true)).toBe('green');
  });

  describe('higherIsBetter (e.g. active minutes, sleep)', () => {
    it('is green at or above the green threshold', () => {
      expect(thresholdTier(30, 30, 20, true)).toBe('green');
      expect(thresholdTier(40, 30, 20, true)).toBe('green');
    });

    it('is yellow at or above the yellow threshold but below green', () => {
      expect(thresholdTier(20, 30, 20, true)).toBe('yellow');
      expect(thresholdTier(25, 30, 20, true)).toBe('yellow');
    });

    it('is red below the yellow threshold', () => {
      expect(thresholdTier(19, 30, 20, true)).toBe('red');
    });

    it('is red below green when there is no yellow threshold', () => {
      expect(thresholdTier(10, 30, null, true)).toBe('red');
    });
  });

  describe('lower-is-better (e.g. blood pressure)', () => {
    it('is green at or below the green threshold', () => {
      expect(thresholdTier(129, 129, 139, false)).toBe('green');
      expect(thresholdTier(100, 129, 139, false)).toBe('green');
    });

    it('is yellow at or below the yellow threshold but above green', () => {
      expect(thresholdTier(135, 129, 139, false)).toBe('yellow');
      expect(thresholdTier(139, 129, 139, false)).toBe('yellow');
    });

    it('is red above the yellow threshold', () => {
      expect(thresholdTier(140, 129, 139, false)).toBe('red');
    });
  });
});

describe('worstTier', () => {
  it('returns null when all tiers are null', () => {
    expect(worstTier(null, null)).toBeNull();
  });

  it('ignores nulls and returns the only tier present', () => {
    expect(worstTier(null, 'yellow')).toBe('yellow');
  });

  it('returns the most severe tier among several', () => {
    expect(worstTier('green', 'yellow')).toBe('yellow');
    expect(worstTier('green', 'red')).toBe('red');
    expect(worstTier('yellow', 'red')).toBe('red');
    expect(worstTier('green', 'green')).toBe('green');
  });
});

describe('svgToImageDataUrl', () => {
  let originalImage: typeof Image;
  let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
  let originalToDataURL: typeof HTMLCanvasElement.prototype.toDataURL;

  beforeEach(() => {
    originalImage = global.Image;
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    originalToDataURL = HTMLCanvasElement.prototype.toDataURL;

    class FakeImage {
      onload: (() => void) | null = null;
      set src(_value: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    }
    (global as any).Image = FakeImage;

    (HTMLCanvasElement.prototype.getContext as any) = jest.fn().mockReturnValue({
      fillStyle: '',
      fillRect: jest.fn(),
      drawImage: jest.fn(),
    });
    HTMLCanvasElement.prototype.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,MOCK');

    if (!URL.createObjectURL) (URL as any).createObjectURL = jest.fn();
    if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = jest.fn();
    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    global.Image = originalImage;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    jest.restoreAllMocks();
  });

  it('resolves with a PNG data URL sized from the svg viewBox', async () => {
    const svg = makeSvg();
    svg.setAttribute('viewBox', '0 0 640 240');

    const dataUrl = await svgToImageDataUrl(svg);

    expect(dataUrl).toBe('data:image/png;base64,MOCK');
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('falls back to default dimensions when there is no viewBox', async () => {
    const svg = makeSvg();
    const dataUrl = await svgToImageDataUrl(svg);
    expect(dataUrl).toBe('data:image/png;base64,MOCK');
  });
});
