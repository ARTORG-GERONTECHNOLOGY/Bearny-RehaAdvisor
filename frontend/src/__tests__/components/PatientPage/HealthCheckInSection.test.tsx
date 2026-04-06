import { fireEvent, render, screen } from '@testing-library/react';
import HealthCheckInSection from '@/components/PatientPage/HealthCheckInSection';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'WeightUnit') return 'KG';
      return key;
    },
  }),
}));

describe('HealthCheckInSection', () => {
  const baseProps = {
    loading: false,
    selectedDateLabel: '22.03.2026',
    weightKg: null,
    bpSys: null,
    bpDia: null,
    onOpenWeightEntry: jest.fn(),
    onOpenBloodPressureEntry: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    const { container } = render(<HealthCheckInSection {...baseProps} loading={true} />);

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('CheckIn')).not.toBeInTheDocument();
    expect(screen.queryByText('0 / 2')).not.toBeInTheDocument();
  });

  it('renders empty check-in cards with 0/2 badge', () => {
    render(<HealthCheckInSection {...baseProps} />);

    expect(screen.getByText('0/2')).toBeInTheDocument();
    expect(screen.getByText(/-- kg/i)).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const normalized = element?.textContent?.replace(/\s/g, '');
        return normalized === '--/--mmHg';
      })
    ).toBeInTheDocument();
  });

  it('renders complete check-in values and 2/2 badge', () => {
    render(<HealthCheckInSection {...baseProps} weightKg={72.4} bpSys={121} bpDia={79} />);

    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('72.4 kg')).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => {
        const normalized = element?.textContent?.replace(/\s/g, '');
        return normalized === '121/79mmHg';
      })
    ).toBeInTheDocument();
  });

  it('opens weight and blood pressure entry handlers on card click', () => {
    const onOpenWeightEntry = jest.fn();
    const onOpenBloodPressureEntry = jest.fn();

    render(
      <HealthCheckInSection
        {...baseProps}
        onOpenWeightEntry={onOpenWeightEntry}
        onOpenBloodPressureEntry={onOpenBloodPressureEntry}
      />
    );

    const cards = screen.getAllByRole('button');
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);

    expect(onOpenWeightEntry).toHaveBeenCalledTimes(1);
    expect(onOpenBloodPressureEntry).toHaveBeenCalledTimes(1);
  });
});
