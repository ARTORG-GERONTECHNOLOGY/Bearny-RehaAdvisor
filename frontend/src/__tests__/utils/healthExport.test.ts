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

  it('falls back to the English question/answer translation when the requested language is missing', async () => {
    const deQStore = {
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
    const blob = buildHealthCsvBlob(
      deQStore,
      from,
      to,
      { ...noSelections, questionnaire: true },
      'de'
    );
    const text = await readBlobText(blob);
    expect(text).toContain('How was your day?');
    expect(text).toContain('Good');
  });

  it('falls back to defaults for missing adherence/questionnaire/exercise/hrZone/sleep fields', async () => {
    const sparseStore = {
      fitbitData: [
        {
          date: '2024-03-01',
          sleep: { sleep_duration: 100000 },
          heart_rate_zones: [{ name: 'Fat Burn', minutes: 10 }],
          exercise: { sessions: [{ duration: 60000 }] },
        },
        { date: '2024-03-02' },
      ],
      adherenceData: [{ date: '2024-03-01' }, { date: '2024-03-02' }],
      questionnaireData: [
        { date: '2024-03-01', questionKey: 'q1', answers: [{ key: 'noTranslation' }] },
      ],
    };
    const blob = buildHealthCsvBlob(
      sparseStore as any,
      from,
      to,
      {
        ...noSelections,
        adherence: true,
        questionnaire: true,
        exercise: true,
        hrZones: true,
        sleep: true,
      },
      'en'
    );
    const text = await readBlobText(blob);
    expect(text).toContain('q1');
    expect(text).toContain('noTranslation');
    expect(text).toContain('Fat Burn');
  });

  it('emits sleep, heart-rate-zone, and exercise rows when the underlying data is present', async () => {
    const richStore = {
      ...store,
      fitbitData: [
        {
          date: '2024-03-01',
          steps: 4000,
          sleep: { sleep_duration: 7 * 3600000, sleep_start: '23:00', sleep_end: '06:00' },
          heart_rate_zones: [{ name: 'Fat Burn', minutes: 30, min: 90, max: 120 }],
          exercise: {
            sessions: [
              {
                name: 'Run',
                duration: 1800000,
                calories: 200,
                averageHeartRate: 130,
                maxHeartRate: 150,
              },
            ],
          },
        },
        {
          date: '2024-03-02',
          steps: 6000,
          sleep: { sleep_duration: 6 * 3600000, sleep_start: '23:30', sleep_end: '05:30' },
        },
      ],
    };
    const blob = buildHealthCsvBlob(
      richStore,
      from,
      to,
      { ...noSelections, sleep: true, hrZones: true, exercise: true },
      'en'
    );
    const text = await readBlobText(blob);
    expect(text).toContain('Sleep Start');
    expect(text).toContain('23:00');
    expect(text).toContain('Fat Burn');
    expect(text).toContain('Run');
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

  it('builds captions for weight, active minutes, exercise, sleep and breathing sections', async () => {
    const richStore = {
      ...store,
      fitbitData: [
        {
          date: '2024-03-01',
          weight_kg: 70,
          active_minutes: 40,
          breathing_rate: { breathingRate: 15 },
          sleep: { minutes_asleep: 420 },
          exercise: { sessions: [{ name: 'Run', duration: 1800000 }] },
        },
        {
          date: '2024-03-02',
          weight_kg: 71,
          active_minutes: 35,
          breathing_rate: { breathingRate: 16 },
          sleep: { minutes_asleep: 400 },
          exercise: { sessions: [{ name: 'Walk', duration: 900000 }] },
        },
      ],
    };
    const refs: SvgRefs = {
      ...emptySvgRefs,
      weight: svgRef(),
      activeMinutes: svgRef(),
      exercise: svgRef(),
      sleep: svgRef(),
      breathing: svgRef(),
    };
    await buildHealthPdf(
      richStore,
      refs,
      from,
      to,
      {
        ...noSelections,
        weight: true,
        activeMinutes: true,
        exercise: true,
        sleep: true,
        breathing: true,
      },
      t,
      'en'
    );

    const captions = textMock.mock.calls.map((call) => call[0]);
    expect(captions.some((c) => typeof c === 'string' && c.includes('kg'))).toBe(true);
    expect(
      captions.filter((c) => typeof c === 'string' && c.includes('avg')).length
    ).toBeGreaterThan(3);
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

  it('builds captions for adherence, wear time, resting HR, and HR zones sections', async () => {
    const richStore = {
      ...store,
      fitbitData: [
        {
          date: '2024-03-01',
          resting_heart_rate: 60,
          wear_time_minutes: 500,
          heart_rate_zones: [{ name: 'Fat Burn', minutes: 30, min: 90, max: 120 }],
        },
        {
          date: '2024-03-02',
          resting_heart_rate: 62,
          wear_time_minutes: 520,
          heart_rate_zones: [{ name: 'Cardio', minutes: 15, min: 120, max: 150 }],
        },
      ],
    };
    const refs: SvgRefs = {
      ...emptySvgRefs,
      adherence: svgRef(),
      wearTime: svgRef(),
      restingHR: svgRef(),
      hrZones: svgRef(),
    };
    await buildHealthPdf(
      richStore,
      refs,
      from,
      to,
      { ...noSelections, adherence: true, wearTime: true, restingHR: true, hrZones: true },
      t,
      'en'
    );

    const captions = textMock.mock.calls.map((call) => call[0]);
    expect(captions.some((c) => typeof c === 'string' && c.includes('Adherence (%)'))).toBe(true);
    expect(captions.some((c) => typeof c === 'string' && c.includes('bpm'))).toBe(true);
    expect(
      captions.some((c) => typeof c === 'string' && c.includes('min') && c.includes('avg'))
    ).toBe(true);
  });

  it('sorts questionnaire entries by date when more than one falls in range', async () => {
    const twoEntryStore = {
      ...store,
      questionnaireData: [
        { ...questionnaireData[0], date: '2024-03-02', questionKey: 'second' },
        { ...questionnaireData[0], date: '2024-03-01', questionKey: 'first' },
      ],
    };
    await buildHealthPdf(
      twoEntryStore,
      emptySvgRefs,
      from,
      to,
      { ...noSelections, questionnaire: true },
      t,
      'en'
    );

    expect(autoTableMock).toHaveBeenCalledTimes(1);
    const [[, opts]] = autoTableMock.mock.calls;
    const dates = opts.body.map((row: string[]) => row[0]);
    expect(dates).toEqual(['01.03.2024', '02.03.2024']);
  });

  it('renders the chart with no caption when the selected section has no in-range data', async () => {
    const emptyDataStore = { ...store, fitbitData: [], adherenceData: [] };
    const refs: SvgRefs = {
      ...emptySvgRefs,
      weight: svgRef(),
      bloodPressure: svgRef(),
      adherence: svgRef(),
    };
    await buildHealthPdf(
      emptyDataStore,
      refs,
      from,
      to,
      { ...noSelections, weight: true, bloodPressure: true, adherence: true },
      t,
      'en'
    );

    expect(addImageMock).toHaveBeenCalledTimes(3);
    const rangeLineCalls = textMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('–')
    );
    // Range line is drawn 24px from the bottom (no caption line) rather than 38px.
    expect(rangeLineCalls.length).toBeGreaterThan(0);
  });

  it('falls back to the question key and an em dash when a questionnaire entry has no translations, answers, or comment', async () => {
    const minimalStore = {
      ...store,
      questionnaireData: [{ date: '2024-03-01', questionKey: 'bare-question', answers: [] }],
    };
    await buildHealthPdf(
      minimalStore,
      emptySvgRefs,
      from,
      to,
      { ...noSelections, questionnaire: true },
      t,
      'en'
    );

    const [[, opts]] = autoTableMock.mock.calls;
    const row = opts.body[0];
    expect(row).toEqual(['01.03.2024', 'bare-question', '—', '—']);
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
