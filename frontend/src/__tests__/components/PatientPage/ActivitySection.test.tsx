import { fireEvent, render, screen } from '@testing-library/react';
import ActivitySection from '@/components/PatientPage/ActivitySection';
jest.mock('react-i18next', () => jest.requireActual('@/__mocks__/react-i18next'));

jest.mock(
  '@/components/PatientPage/GoogleHealthConnectButton',
  () =>
    function GoogleHealthConnectButton() {
      return <div data-testid="fitbit-connect-button">Connect</div>;
    }
);

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
    const { container } = render(<ActivitySection {...baseProps} loading={true} />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('Todays Activity')).not.toBeInTheDocument();
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

  it('hides the Fitbit connect button when wearableDevice is omron', () => {
    render(<ActivitySection {...baseProps} connected={false} wearableDevice="omron" />);
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('hides the Fitbit connect button when wearableDevice is none', () => {
    render(<ActivitySection {...baseProps} connected={false} wearableDevice="none" />);
    expect(screen.queryByTestId('fitbit-connect-button')).not.toBeInTheDocument();
  });

  it('shows the Fitbit connect button when wearableDevice is fitbit and disconnected', () => {
    render(<ActivitySection {...baseProps} connected={false} wearableDevice="fitbit" />);
    expect(screen.getByTestId('fitbit-connect-button')).toBeInTheDocument();
  });

  it('shows the Fitbit connect button when wearableDevice is unset and disconnected', () => {
    render(<ActivitySection {...baseProps} connected={false} />);
    expect(screen.getByTestId('fitbit-connect-button')).toBeInTheDocument();
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

  it('shows the checkmark icon when disconnected with a nonzero manual step count', () => {
    const { container } = render(
      <ActivitySection {...baseProps} connected={false} stepsToday={500} />
    );
    expect(container.querySelector('.text-ok')).toBeInTheDocument();
  });

  it('does not open the manual steps entry when the steps card is clicked while connected', () => {
    const onOpenManualStepsEntry = jest.fn();
    render(
      <ActivitySection
        {...baseProps}
        connected={true}
        onOpenManualStepsEntry={onOpenManualStepsEntry}
      />
    );

    fireEvent.click(screen.getByText('Steps').closest('div')!.parentElement!.parentElement!);
    expect(onOpenManualStepsEntry).not.toHaveBeenCalled();
  });

  it('falls back to "--" for steps/goal/minutes when values are missing, and shows the AZM breakdown', () => {
    render(
      <ActivitySection
        {...baseProps}
        connected={true}
        stepsToday={null}
        stepsGoal={null}
        activeMinutes={null}
        activeMinutesGoal={null}
        activeZoneMinutes={{ fat_burn: 10, cardio: 5, peak: 2 }}
      />
    );

    expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    expect(screen.getByText(/fatBurnZone: 10/)).toBeInTheDocument();
    expect(screen.getByText(/cardioZone: 5/)).toBeInTheDocument();
    expect(screen.getByText(/peakZone: 2/)).toBeInTheDocument();
  });

  it('does not show the AZM breakdown when fat_burn/cardio/peak are all null', () => {
    render(
      <ActivitySection
        {...baseProps}
        connected={true}
        activeZoneMinutes={{ fat_burn: null, cardio: null, peak: null, total: 0 }}
      />
    );

    expect(screen.queryByText(/fatBurnZone/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cardioZone/)).not.toBeInTheDocument();
    expect(screen.queryByText(/peakZone/)).not.toBeInTheDocument();
  });
});
