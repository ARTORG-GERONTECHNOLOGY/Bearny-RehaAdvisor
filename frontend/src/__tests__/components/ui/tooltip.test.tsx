import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

describe('Tooltip', () => {
  it('does not render content when closed', () => {
    render(
      <TooltipProvider>
        <Tooltip open={false}>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Hint text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.queryByText('Hint text')).not.toBeInTheDocument();
  });

  it('renders content when open', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Hint text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByRole('tooltip')).toHaveTextContent('Hint text');
  });

  it('opens on hover when uncontrolled', async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Hint text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(screen.getByText('Hover me'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Hint text');
  });

  it('calls onOpenChange when the open state changes', async () => {
    const user = userEvent.setup();
    const onOpenChange = jest.fn();
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip onOpenChange={onOpenChange}>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Hint text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    await user.hover(screen.getByText('Hover me'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
  });

  it('merges a custom className onto TooltipContent', () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent className="my-tooltip">Hint text</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
    expect(screen.getByRole('tooltip')).toHaveClass('my-tooltip');
  });
});
