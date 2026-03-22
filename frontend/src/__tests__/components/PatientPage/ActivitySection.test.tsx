import { fireEvent, render, screen } from '@testing-library/react';
import ActivitySection from '@/components/PatientPage/ActivitySection';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/PatientPage/FitbitStatus', () => () => (
  <div data-testid="fitbit-connect-button">Connect</div>
));

jest.mock('@/components/PatientPage/ProgressIndicator', () =>
  jest.fn(({ current, goal }: { current: number; goal: number }) => (
    <div data-testid="progress-indicator">
      {current}/{goal}
    </div>
  ))
);

jest.mock('recharts', () => ({
  BarChart: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div data-testid="steps-bar" />,
  CartesianGrid: () => null,
  ReferenceLine: () => <div data-testid="goal-reference-line" />,
  XAxis: () => null,
  YAxis: () => null,
}));

jest.mock('@/components/ui/chart', () => ({
  ChartContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ChartTooltip: () => null,
  ChartTooltipContent: () => null,
}));

describe('ActivitySection', () => {
  const baseProps = {
    loading: false,
    connected: false,
    stepsToday: null,
    stepsGoal: null,
    stepsHistoryData: [],
    stepsChartMax: 10000,
    activeMinutes: null,
    activeMinutesGoal: null,
    sleepMinutes: null,
    sleepMinutesGoal: null,
    onOpenManualStepsEntry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<ActivitySection {...baseProps} loading={true} />);

    expect(screen.getByText('Todays Activity')).toBeInTheDocument();
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('renders disconnected state and opens manual steps entry on click', () => {
    const onOpenManualStepsEntry = jest.fn();

    render(
      <ActivitySection
        {...baseProps}
        connected={false}
        stepsToday={0}
        stepsGoal={10000}
        onOpenManualStepsEntry={onOpenManualStepsEntry}
      />
    );

    expect(screen.getByText('Manual entry')).toBeInTheDocument();
    expect(screen.getByTestId('fitbit-connect-button')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(onOpenManualStepsEntry).toHaveBeenCalledTimes(1);
  });

  it('renders connected metrics and formatted minute values', () => {
    render(
      <ActivitySection
        {...baseProps}
        connected={true}
        stepsToday={4800}
        stepsGoal={10000}
        activeMinutes={90}
        activeMinutesGoal={120}
        sleepMinutes={430}
        sleepMinutesGoal={480}
        stepsHistoryData={[
          { date: '03-20', steps: 4000 },
          { date: '03-21', steps: 5000 },
        ]}
      />
    );

    expect(screen.getByText('Fitbit Connected')).toBeInTheDocument();
    expect(screen.getAllByTestId('progress-indicator')).toHaveLength(3);
    expect(screen.getByText('1h 30min')).toBeInTheDocument();
    expect(screen.getByText('7h 10min')).toBeInTheDocument();
    expect(screen.getByTestId('goal-reference-line')).toBeInTheDocument();
  });
});
