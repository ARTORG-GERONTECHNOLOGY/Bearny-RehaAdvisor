import { render, screen } from '@testing-library/react';
import ThresholdStatusBadge from '@/components/PatientProcess/ThresholdStatusBadge';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ThresholdStatusBadge', () => {
  it('renders nothing when status is unknown', () => {
    const { container } = render(<ThresholdStatusBadge isReached={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders success state text and icon when threshold is reached', () => {
    render(<ThresholdStatusBadge isReached={true} />);

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByTestId('svg-mock')).toBeInTheDocument();
  });

  it('renders failure state text and icon when threshold is not reached', () => {
    render(<ThresholdStatusBadge isReached={false} />);

    expect(screen.getByText('Not reached')).toBeInTheDocument();
    expect(screen.getByTestId('svg-mock')).toBeInTheDocument();
  });
});
