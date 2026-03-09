import { render, screen } from '@testing-library/react';
import InfoBubble from '@/components/common/InfoBubble';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

describe('InfoBubble', () => {
  it('renders the Info icon', () => {
    render(<InfoBubble tooltip="Test tooltip" />);
    const icon = screen.getByTestId('lucide-icon');
    expect(icon).toBeInTheDocument();
  });

  it('shows tooltip on hover', async () => {
    render(<InfoBubble tooltip="Hover text" />);
    const iconWrapper = screen.getByRole('button', { name: 'More information' });

    // Hover over the icon
    await userEvent.hover(iconWrapper);

    // Check if the tooltip text appears
    expect(await screen.findByText('Hover text')).toBeInTheDocument();
  });
});
