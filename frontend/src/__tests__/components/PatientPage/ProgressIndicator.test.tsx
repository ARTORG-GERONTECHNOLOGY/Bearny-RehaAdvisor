import { render } from '@testing-library/react';
import ProgressIndicator from '@/components/PatientPage/ProgressIndicator';

const mockRadialBarChart = jest.fn(({ children }: { children?: React.ReactNode }) => (
  <div data-testid="radial-chart">{children}</div>
));

jest.mock('recharts', () => ({
  PolarAngleAxis: () => <div data-testid="polar-axis" />,
  RadialBar: () => <div data-testid="radial-bar" />,
  RadialBarChart: (props: { children?: React.ReactNode }) => mockRadialBarChart(props),
}));

describe('ProgressIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes proportional value when current is below goal', () => {
    render(<ProgressIndicator current={50} goal={100} />);

    const firstCallProps = mockRadialBarChart.mock.calls[0][0];
    expect(firstCallProps.data[0].value).toBe(50);
  });

  it('clamps value to 100 when current exceeds goal', () => {
    render(<ProgressIndicator current={200} goal={100} />);

    const firstCallProps = mockRadialBarChart.mock.calls[0][0];
    expect(firstCallProps.data[0].value).toBe(100);
  });

  it('returns 0 when goal is zero or invalid for progress computation', () => {
    render(<ProgressIndicator current={80} goal={0} />);

    const firstCallProps = mockRadialBarChart.mock.calls[0][0];
    expect(firstCallProps.data[0].value).toBe(0);
  });

  it('clamps negative progress to 0', () => {
    render(<ProgressIndicator current={-20} goal={100} />);

    const firstCallProps = mockRadialBarChart.mock.calls[0][0];
    expect(firstCallProps.data[0].value).toBe(0);
  });
});
