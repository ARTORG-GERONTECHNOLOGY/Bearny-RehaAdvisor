import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import HelpPage from '@/pages/Help';

jest.mock('@/components/help/HelpCenter', () => {
  return function HelpCenterMock({ open, onClose }: { open: boolean; onClose: () => void }) {
    return open ? (
      <div data-testid="help-center">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null;
  };
});

describe('HelpPage', () => {
  it('renders HelpCenter open by default', () => {
    render(<HelpPage />);
    expect(screen.getByTestId('help-center')).toBeInTheDocument();
  });

  it('closes HelpCenter when onClose is triggered', () => {
    render(<HelpPage />);
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('help-center')).not.toBeInTheDocument();
  });
});
