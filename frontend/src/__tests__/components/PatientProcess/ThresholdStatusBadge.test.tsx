import { render, screen } from '@testing-library/react';
import ThresholdStatusBadge from '@/components/PatientProcess/ThresholdStatusBadge';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ThresholdStatusBadge', () => {
  it('renders nothing when status is unknown', () => {
    const { container } = render(<ThresholdStatusBadge status={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders success state text and icon when threshold is reached', () => {
    render(<ThresholdStatusBadge status="green" />);

    expect(screen.getByText('Reached')).toBeInTheDocument();
    expect(screen.getByTestId('svg-mock')).toBeInTheDocument();
  });

  it('renders warning state text and icon when threshold is partially reached', () => {
    render(<ThresholdStatusBadge status="yellow" />);

    expect(screen.getByText('Not reached')).toBeInTheDocument();
    expect(screen.getByTestId('svg-mock')).toBeInTheDocument();
  });

  it('renders failure state text and icon when threshold is not reached', () => {
    render(<ThresholdStatusBadge status="red" />);

    expect(screen.getByText('Not reached')).toBeInTheDocument();
    expect(screen.getByTestId('svg-mock')).toBeInTheDocument();
  });
});
