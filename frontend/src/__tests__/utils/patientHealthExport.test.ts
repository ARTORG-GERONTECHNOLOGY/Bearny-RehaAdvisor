// jsPDF/autotable produce real binary/canvas output we can't (and don't need to) verify
// byte-for-byte — capture the calls that determine page content/order instead (see
// healthExport.test.ts, which uses the same approach for the therapist PDF export).
const textMock = jest.fn();
const addPageMock = jest.fn();
const setFontSizeMock = jest.fn();
const saveMock = jest.fn();

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 800, getHeight: () => 600 } },
    text: textMock,
    addPage: addPageMock,
    setFontSize: setFontSizeMock,
    save: saveMock,
  })),
}));

const autoTableMock = jest.fn();
jest.mock('jspdf-autotable', () => ({
  __esModule: true,
  default: (...args: unknown[]) => autoTableMock(...args),
}));

import { buildPatientHealthPdf } from '@/utils/patientHealthExport';
import type { PatientExportMetric } from '@/utils/patientHealthExport';
import type { FitbitEntry } from '@/types/health';

const t = (k: string) => k;

const fitbitData: FitbitEntry[] = [
  {
    date: '2024-03-01',
    steps: 4000,
    active_minutes: 20,
    sleep: { minutes_asleep: 420 },
    bp_sys: 120,
    bp_dia: 80,
  },
  {
    date: '2024-03-02',
    steps: 6000,
    active_minutes: 40,
    sleep: { minutes_asleep: 360 },
    bp_sys: 130,
    bp_dia: 90,
  },
  // Outside the export range below — must never show up in the output.
  { date: '2024-04-01', steps: 9999, active_minutes: 99, bp_sys: 999, bp_dia: 999 },
];

const store = { fitbitData } as any;

const from = new Date(2024, 2, 1); // 2024-03-01
const to = new Date(2024, 2, 2); // 2024-03-02

const allSelections: Record<PatientExportMetric, boolean> = {
  steps: true,
  activeMinutes: true,
  sleep: true,
  bloodPressure: true,
};

const noSelections: Record<PatientExportMetric, boolean> = {
  steps: false,
  activeMinutes: false,
  sleep: false,
  bloodPressure: false,
};

describe('buildPatientHealthPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never calls doc.save itself — that stays the caller’s responsibility', () => {
    buildPatientHealthPdf(store, from, to, allSelections, t);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('adds one page per selected metric, with no leading page break', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, steps: true }, t);
    expect(addPageMock).not.toHaveBeenCalled();

    jest.clearAllMocks();
    buildPatientHealthPdf(
      store,
      from,
      to,
      { ...noSelections, steps: true, activeMinutes: true, sleep: true },
      t
    );
    expect(addPageMock).toHaveBeenCalledTimes(2);
  });

  it('only builds tables for the selected metrics, in a fixed order', () => {
    buildPatientHealthPdf(
      store,
      from,
      to,
      { ...noSelections, bloodPressure: true, steps: true },
      t
    );

    const titles = textMock.mock.calls.map((call) => call[0]);
    const stepsIndex = titles.indexOf('Daily Steps');
    const bpIndex = titles.indexOf('Blood pressure');
    expect(stepsIndex).toBeGreaterThanOrEqual(0);
    expect(bpIndex).toBeGreaterThan(stepsIndex);
    expect(titles).not.toContain('Active Minutes');
    expect(titles).not.toContain('Sleep Schedule and Duration');
  });

  it('builds a Date/Steps table with rows restricted to the [from, to] range', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, steps: true }, t);

    expect(autoTableMock).toHaveBeenCalledTimes(1);
    const [[, opts]] = autoTableMock.mock.calls;
    expect(opts.head).toEqual([['Date', 'Steps']]);
    expect(opts.body).toEqual([
      ['01.03.2024', '4000'],
      ['02.03.2024', '6000'],
    ]);
    expect(JSON.stringify(opts.body)).not.toContain('9999');
  });

  it('builds a Date/Active Minutes table', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, activeMinutes: true }, t);

    const [[, opts]] = autoTableMock.mock.calls;
    expect(opts.head).toEqual([['Date', 'Active Minutes']]);
    expect(opts.body).toEqual([
      ['01.03.2024', '20'],
      ['02.03.2024', '40'],
    ]);
  });

  it('builds a Date/Duration sleep table in hours, with no Sleep Start/End columns', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, sleep: true }, t);

    const [[, opts]] = autoTableMock.mock.calls;
    expect(opts.head).toEqual([['Date', 'Duration (h)']]);
    // 420 min / 60 = 7.00h, 360 min / 60 = 6.00h
    expect(opts.body).toEqual([
      ['01.03.2024', '7.00'],
      ['02.03.2024', '6.00'],
    ]);
  });

  it('builds a Date/Systolic/Diastolic blood pressure table', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, bloodPressure: true }, t);

    const [[, opts]] = autoTableMock.mock.calls;
    expect(opts.head).toEqual([['Date', 'Systolic (mmHg)', 'Diastolic (mmHg)']]);
    expect(opts.body).toEqual([
      ['01.03.2024', '120', '80'],
      ['02.03.2024', '130', '90'],
    ]);
  });

  it('shows "No data available" and skips the table when a metric has no in-range data', () => {
    const emptyStore = { fitbitData: [] } as any;
    buildPatientHealthPdf(emptyStore, from, to, { ...noSelections, steps: true }, t);

    expect(textMock).toHaveBeenCalledWith(
      'No data available',
      expect.any(Number),
      expect.any(Number),
      { align: 'center' }
    );
    expect(autoTableMock).not.toHaveBeenCalled();
  });

  it('draws an avg/min/max caption for steps', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, steps: true }, t);

    const captions = textMock.mock.calls.map((call) => call[0]);
    // avg (4000+6000)/2 = 5000
    expect(captions).toContain('avg 5,000 · min 4,000 · max 6,000');
  });

  it('builds a two-part systolic/diastolic caption for blood pressure, in mmHg', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, bloodPressure: true }, t);

    const captions = textMock.mock.calls.map((call) => call[0]);
    const caption = captions.find((c) => typeof c === 'string' && c.includes('mmHg'));
    expect(caption).toContain('Blood pressure systolic: avg 125 · min 120 · max 130');
    expect(caption).toContain('Blood pressure diastolic: avg 85 · min 80 · max 90');
    expect(caption).toMatch(/mmHg$/);
  });

  it('draws the date range line for every selected section', () => {
    buildPatientHealthPdf(store, from, to, { ...noSelections, steps: true }, t);

    const rangeLine = textMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('–')
    );
    expect(rangeLine?.[0]).toBe('01.03.2024 – 02.03.2024');
  });
});
