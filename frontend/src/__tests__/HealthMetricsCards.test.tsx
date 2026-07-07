import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Chart sub-components use d3/SVG – replace with testid stubs ───────────────
jest.mock('@/components/Health/charts/AdherenceLine', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-adherence" />),
  averageAdherencePct: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/SleepChart', () =>
  React.forwardRef(() => <div data-testid="chart-sleep" />)
);
jest.mock('@/components/Health/charts/WearTimeChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-weartime" />),
  averageWearTime: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/RestingHRChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-restinghr" />),
  averageRestingHR: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/BreathingChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-breathing" />),
  averageBreathingRate: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/HRZonesStacked', () =>
  React.forwardRef(() => <div data-testid="chart-hrzones" />)
);
jest.mock('@/components/Health/charts/WeightChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-weight" />),
  averageWeight: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/StepsChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-steps" />),
  averageSteps: jest.fn(() => null),
}));
jest.mock('@/components/Health/charts/BloodPressureChart', () => ({
  __esModule: true,
  default: React.forwardRef(() => <div data-testid="chart-bloodpressure" />),
  averageBloodPressure: jest.fn(() => ({ sys: null, dia: null })),
}));
jest.mock('@/components/Health/charts/ExerciseSessionsChart', () =>
  React.forwardRef(() => <div data-testid="chart-exercise" />)
);
jest.mock('@/components/Health/charts/ExerciseSessionsTable', () => () => (
  <div data-testid="table-exercise" />
));
jest.mock('@/components/Health/QuestionnaireResultsTable', () => ({
  __esModule: true,
  default: () => <div data-testid="table-questionnaire" />,
  countQuestionnaireDays: jest.fn(() => 0),
}));

import HealthMetricsCards from '@/components/Health/HealthMetricsCards';
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

describe('HealthMetricsCards – card headers', () => {
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

  it('renders all 11 card section headers', () => {
    render(<HealthMetricsCards store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />);

    expectedHeaders.forEach((header) => {
      expect(screen.getByText(header)).toBeInTheDocument();
    });
  });

  it.each(expectedHeaders)('displays the "%s" card header', (header) => {
    render(<HealthMetricsCards store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />);
    expect(screen.getByText(header)).toBeInTheDocument();
  });

  it('renders exactly 11 cards', () => {
    const { container } = render(
      <HealthMetricsCards store={makeStore()} t={t} lang="en" svgRefs={svgRefs} />
    );
    expect(container.querySelectorAll('.rounded-xl.border.border-accent')).toHaveLength(11);
  });
});
