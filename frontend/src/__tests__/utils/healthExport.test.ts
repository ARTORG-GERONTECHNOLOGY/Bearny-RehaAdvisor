// D3 is ESM-only — mock with faithful implementations of just what healthExport.ts uses.
jest.mock('d3', () => ({
  groups: (arr: any[], keyFn: (d: any) => string) => {
    const map = new Map<string, any[]>();
    for (const item of arr) {
      const key = keyFn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  },
  sum: (arr: any[], fn: (d: any) => number) => arr.reduce((s, item) => s + fn(item), 0),
}));

// jsPDF/autotable produce real binary/canvas output we can't (and don't need to) verify
// byte-for-byte — capture the calls that determine page content/order instead.
const textMock = jest.fn();
const addPageMock = jest.fn();
const addImageMock = jest.fn();
const saveMock = jest.fn();
const setFontSizeMock = jest.fn();

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    getFontSize: () => 12,
    internal: { pageSize: { getWidth: () => 800, getHeight: () => 600 } },
    text: textMock,
    addPage: addPageMock,
    addImage: addImageMock,
    setFontSize: setFontSizeMock,
    save: saveMock,
  })),
}));

const autoTableMock = jest.fn();
jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: (...args: unknown[]) => autoTableMock(...args),
}));

// Real isInRange/buildDailyRows/toEuroDate/etc. give genuine coverage of the date-range
// wiring; only svgToImageDataUrl needs stubbing since it depends on jsdom's unsupported
// Canvas/Image APIs.
jest.mock('@/utils/healthCharts', () => ({
  ...jest.requireActual('@/utils/healthCharts'),
  svgToImageDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,fake'),
}));

import { buildHealthCsvBlob, buildHealthPdf } from '@/utils/healthExport';
import type { SvgRefs } from '@/components/Health/HealthMetricsCards';
import type { FitbitEntry, QuestionnaireEntry, AdherenceEntry } from '@/types/health';

const t = (k: string) => k;

const fitbitData: FitbitEntry[] = [
  { date: '2024-03-01', steps: 4000, weight_kg: 70, bp_sys: 120, bp_dia: 80 },
  { date: '2024-03-02', steps: 6000, weight_kg: 70.5, bp_sys: 125, bp_dia: 82 },
  // Outside the export range below — must never show up in either output.
  { date: '2024-04-01', steps: 9999, weight_kg: 99 },
];

const adherenceData: AdherenceEntry[] = [
  { date: '2024-03-01', scheduled: 2, completed: 1, pct: 50 },
  { date: '2024-03-02', scheduled: 2, completed: 2, pct: 100 },
];

const questionnaireData: QuestionnaireEntry[] = [
  {
    date: '2024-03-01',
    questionKey: 'q1',
    answers: [{ key: '3', translations: [{ language: 'en', text: 'Good' }] }],
    questionTranslations: [{ language: 'en', text: 'How was your day?' }],
    comment: 'felt "great"; thanks',
  },
];

const store = { fitbitData, adherenceData, questionnaireData } as any;

const from = new Date(2024, 2, 1); // 2024-03-01
const to = new Date(2024, 2, 2); // 2024-03-02

const allSelections: Record<string, boolean> = {
  totalScore: true,
  adherence: true,
  questionnaire: true,
  restingHR: true,
  steps: true,
  activeMinutes: true,
  breathing: true,
  wearTime: true,
  sleep: true,
  hrZones: true,
  weight: true,
  bloodPressure: true,
  exercise: true,
};

const noSelections: Record<string, boolean> = Object.fromEntries(
  Object.keys(allSelections).map((k) => [k, false])
);

// jsdom's Blob has neither .text() nor .arrayBuffer() — FileReader is the only reliable
// way to read one back in this test environment. readAsText decodes per the WHATWG spec,
// which consumes/strips a leading UTF-8 BOM, so BOM presence needs the raw bytes instead.
const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });

const readBlobBytes = (blob: Blob): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });

describe('buildHealthCsvBlob', () => {
  it('returns a CSV blob with a UTF-8 BOM prefix', async () => {
    const blob = buildHealthCsvBlob(store, from, to, allSelections, 'en');
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    const bytes = await readBlobBytes(blob);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('includes only the sections that are selected', async () => {
    const blob = buildHealthCsvBlob(store, from, to, { ...noSelections, steps: true }, 'en');
    const text = await readBlobText(blob);
    expect(text).toContain('Steps');
    expect(text).toContain('4000');
    expect(text).not.toContain('Weight (kg)');
    expect(text).not.toContain('Systolic');
  });

  it('excludes data outside the [from, to] range', async () => {
    const blob = buildHealthCsvBlob(store, from, to, { ...noSelections, steps: true }, 'en');
    const text = await readBlobText(blob);
    expect(text).not.toContain('9999');
  });

  it('computes the total questionnaire score per day via d3.groups/d3.sum', async () => {
    const blob = buildHealthCsvBlob(store, from, to, { ...noSelections, totalScore: true }, 'en');
    const text = await readBlobText(blob);
    expect(text).toContain('Total Score');
    expect(text).toContain('01.03.2024;3');
  });

  it('quotes CSV fields containing the delimiter or double quotes', async () => {
    const blob = buildHealthCsvBlob(
      store,
      from,
      to,
      { ...noSelections, questionnaire: true },
      'en'
    );
    const text = await readBlobText(blob);
    expect(text).toContain('"felt ""great""; thanks"');
  });

  it('omits a section entirely when there is no data for it in range', async () => {
    const blob = buildHealthCsvBlob(
      store,
      from,
      to,
      { ...noSelections, bloodPressure: false },
      'en'
    );
    const text = await readBlobText(blob);
    expect(text.trim()).toBe('');
  });
});

describe('buildHealthPdf', () => {
  const emptySvgRefs: SvgRefs = {
    adherence: { current: null },
    restingHR: { current: null },
    sleep: { current: null },
    wearTime: { current: null },
    hrZones: { current: null },
    steps: { current: null },
    activeMinutes: { current: null },
    breathing: { current: null },
    weight: { current: null },
    bloodPressure: { current: null },
    exercise: { current: null },
  };

  // A ref whose div actually has a rendered <svg> child, the way the real chart
  // components leave it once Recharts has mounted.
  const svgRef = () => {
    const div = document.createElement('div');
    div.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    return { current: div };
  };

  it('never calls doc.save itself — that stays the caller’s responsibility', async () => {
    await buildHealthPdf(store, emptySvgRefs, from, to, allSelections, t, 'en');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('adds one page per selected section, in the fixed card order', async () => {
    // Card order is Engagement → Cardiovascular → Activity → Sleep & Recovery, so
    // questionnaire (Engagement) comes before steps and weight (both Activity).
    const selections = { ...noSelections, steps: true, weight: true, questionnaire: true };
    await buildHealthPdf(store, emptySvgRefs, from, to, selections, t, 'en');

    // 3 sections selected → 2 addPage calls (no page break before the first section).
    expect(addPageMock).toHaveBeenCalledTimes(2);

    const titles = textMock.mock.calls.map((call) => call[0]);
    const questionnaireIndex = titles.indexOf('Questionnaire Results By Date');
    const stepsIndex = titles.indexOf('Daily Steps');
    const weightIndex = titles.indexOf('Weight (kg)');
    expect(questionnaireIndex).toBeGreaterThanOrEqual(0);
    expect(stepsIndex).toBeGreaterThan(questionnaireIndex);
    expect(weightIndex).toBeGreaterThan(stepsIndex);
  });

  it('shows "No data available" when a selected chart has no rendered svg', async () => {
    await buildHealthPdf(store, emptySvgRefs, from, to, { ...noSelections, steps: true }, t, 'en');
    expect(textMock).toHaveBeenCalledWith(
      'No data available',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' }
    );
    expect(addImageMock).not.toHaveBeenCalled();
  });

  it('renders the questionnaire section as a table, not a chart image', async () => {
    await buildHealthPdf(
      store,
      emptySvgRefs,
      from,
      to,
      { ...noSelections, questionnaire: true },
      t,
      'en'
    );
    expect(autoTableMock).toHaveBeenCalledTimes(1);
    expect(addImageMock).not.toHaveBeenCalled();
  });

  it('draws the chart image and an avg/min/max caption when the svg is rendered', async () => {
    const refs: SvgRefs = { ...emptySvgRefs, steps: svgRef() };
    await buildHealthPdf(store, refs, from, to, { ...noSelections, steps: true }, t, 'en');

    expect(addImageMock).toHaveBeenCalledTimes(1);
    const captions = textMock.mock.calls.map((call) => call[0]);
    expect(captions.some((c) => typeof c === 'string' && c.includes('avg'))).toBe(true);
  });

  it('builds a two-part sys/dia caption for blood pressure, in mmHg', async () => {
    const refs: SvgRefs = { ...emptySvgRefs, bloodPressure: svgRef() };
    await buildHealthPdf(store, refs, from, to, { ...noSelections, bloodPressure: true }, t, 'en');

    const captions = textMock.mock.calls.map((call) => call[0]);
    const caption = captions.find((c) => typeof c === 'string' && c.includes('mmHg'));
    expect(caption).toContain('Blood pressure systolic');
    expect(caption).toContain('Blood pressure diastolic');
    expect(caption).toMatch(/mmHg$/);
  });

  it('builds captions for weight, exercise, sleep and breathing sections', async () => {
    const refs: SvgRefs = {
      ...emptySvgRefs,
      weight: svgRef(),
      exercise: svgRef(),
      sleep: svgRef(),
      breathing: svgRef(),
    };
    await buildHealthPdf(
      store,
      refs,
      from,
      to,
      { ...noSelections, weight: true, exercise: true, sleep: true, breathing: true },
      t,
      'en'
    );

    const captions = textMock.mock.calls.map((call) => call[0]);
    expect(captions.some((c) => typeof c === 'string' && c.includes('kg'))).toBe(true);
  });

  it('shows "No data available" for the questionnaire section when nothing is in range', async () => {
    const outOfRangeStore = {
      ...store,
      questionnaireData: [{ ...questionnaireData[0], date: '2024-05-01' }],
    };
    await buildHealthPdf(
      outOfRangeStore,
      emptySvgRefs,
      from,
      to,
      { ...noSelections, questionnaire: true },
      t,
      'en'
    );

    expect(textMock).toHaveBeenCalledWith(
      'No data available',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' }
    );
    expect(autoTableMock).not.toHaveBeenCalled();
  });

  it('falls back to the English translation when the requested language is missing', async () => {
    const deStore = {
      ...store,
      questionnaireData: [
        {
          date: '2024-03-01',
          questionKey: 'q1',
          answers: [{ key: '3', translations: [{ language: 'en', text: 'Good' }] }],
          questionTranslations: [{ language: 'en', text: 'How was your day?' }],
        },
      ],
    };
    await buildHealthPdf(
      deStore,
      emptySvgRefs,
      from,
      to,
      { ...noSelections, questionnaire: true },
      t,
      'de'
    );

    expect(autoTableMock).toHaveBeenCalledTimes(1);
    const [[, opts]] = autoTableMock.mock.calls;
    const bodyText = JSON.stringify(opts.body);
    expect(bodyText).toContain('How was your day?');
  });
});
