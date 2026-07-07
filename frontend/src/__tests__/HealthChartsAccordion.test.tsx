import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Chart sub-components use d3/SVG – replace with testid stubs ───────────────
jest.mock('@/components/Health/charts/AdherenceLine', () =>
  React.forwardRef(() => <div data-testid="chart-adherence" />)
);
jest.mock('@/components/Health/charts/MetricBarOrBox', () =>
  React.forwardRef(({ titleKey }: { titleKey: string }) => (
    <div data-testid={`chart-metric-${titleKey}`} />
  ))
);
jest.mock('@/components/Health/charts/SleepChart', () =>
  React.forwardRef(() => <div data-testid="chart-sleep" />)
);
jest.mock('@/components/Health/charts/HRZonesStacked', () =>
  React.forwardRef(() => <div data-testid="chart-hrzones" />)
);
jest.mock('@/components/Health/charts/WeightChart', () =>
  React.forwardRef(() => <div data-testid="chart-weight" />)
);
jest.mock('@/components/Health/charts/BloodPressureChart', () =>
  React.forwardRef(() => <div data-testid="chart-bloodpressure" />)
);
jest.mock('@/components/Health/charts/ExerciseSessionsChart', () =>
  React.forwardRef(() => <div data-testid="chart-exercise" />)
);
jest.mock('@/components/Health/charts/ExerciseSessionsTable', () => () => (
  <div data-testid="table-exercise" />
));
jest.mock('@/components/Health/QuestionnaireResultsTable', () => () => (
  <div data-testid="table-questionnaire" />
));

import HealthChartsAccordion from '@/components/Health/HealthChartsAccordion';
import type { HealthPageStore } from '@/stores/healthPageStore';
import type { FitbitEntry } from '@/types/health';

// ── minimal store stub ────────────────────────────────────────────────────────
const makeStore = (overrides: Partial<HealthPageStore> = {}): HealthPageStore =>
  ({
    fitbitData: [] as FitbitEntry[],
    questionnaireData: [],
    adherenceData: [],
    thresholds: { steps_goal: 10000 },
    startDate: new Date('2024-01-08'),
    endDate: new Date('2024-01-15'),
    ...overrides,
  }) as unknown as HealthPageStore;

const t = (key: string) => key;

// SVG ref stubs
const svgRefs = {
  adherence: React.createRef<SVGSVGElement>(),
  restingHR: React.createRef<SVGSVGElement>(),
  sleep: React.createRef<SVGSVGElement>(),
  wearTime: React.createRef<SVGSVGElement>(),
  hrZones: React.createRef<SVGSVGElement>(),
  steps: React.createRef<SVGSVGElement>(),
  breathing: React.createRef<SVGSVGElement>(),
  weight: React.createRef<SVGSVGElement>(),
  bloodPressure: React.createRef<SVGSVGElement>(),
  exercise: React.createRef<SVGSVGElement>(),
};

// ─────────────────────────────────────────────────────────────────────────────

describe('HealthChartsAccordion – accordion headers', () => {
  const expectedHeaders = [
    'Adherence',
    'Questionnaire Results By Date',
    'Resting HR',
    'Sleep',
    'Wear Time',
    'HR Zones',
    'Steps',
    'Breathing',
    'WeightLabel',
    'Blood pressure',
    'Exercises',
  ];

  it('renders all 11 accordion section headers', () => {
    render(<HealthChartsAccordion store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />);

    expectedHeaders.forEach((header) => {
      expect(screen.getByText(header)).toBeInTheDocument();
    });
  });

  it.each(expectedHeaders)('displays the "%s" accordion header', (header) => {
    render(<HealthChartsAccordion store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.getByText(header)).toBeInTheDocument();
  });

  it('renders exactly 11 accordion items', () => {
    render(<HealthChartsAccordion store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />);
    // Each Accordion.Item renders a button for its header
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(11);
  });
});

describe('HealthChartsAccordion – device-hint messages', () => {
  const fitbitBase: FitbitEntry = {
    date: '2024-01-10',
    steps: 5000,
  };

  it('shows resting-HR hint when all Fitbit entries lack resting_heart_rate', () => {
    const store = makeStore({ fitbitData: [fitbitBase] as FitbitEntry[] });
    render(<HealthChartsAccordion store={store} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.getByText('hint_resting_hr_empty')).toBeInTheDocument();
  });

  it('shows wear-time hint when all Fitbit entries lack wear_time_minutes', () => {
    const store = makeStore({ fitbitData: [fitbitBase] as FitbitEntry[] });
    render(<HealthChartsAccordion store={store} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.getByText('hint_wear_time_empty')).toBeInTheDocument();
  });

  it('shows breathing-rate hint when all Fitbit entries lack breathing_rate', () => {
    const store = makeStore({ fitbitData: [fitbitBase] as FitbitEntry[] });
    render(<HealthChartsAccordion store={store} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.getByText('hint_breathing_rate_empty')).toBeInTheDocument();
  });

  it('does not show hints when Fitbit data is absent (no entries at all)', () => {
    const store = makeStore({ fitbitData: [] });
    render(<HealthChartsAccordion store={store} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.queryByText('hint_resting_hr_empty')).not.toBeInTheDocument();
    expect(screen.queryByText('hint_wear_time_empty')).not.toBeInTheDocument();
    expect(screen.queryByText('hint_breathing_rate_empty')).not.toBeInTheDocument();
  });
});
