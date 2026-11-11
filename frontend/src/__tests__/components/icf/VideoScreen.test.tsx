import { render, screen, fireEvent } from '@testing-library/react';
import VideoScreen, { EXPLAINER_VIDEO_SRC } from '@/components/icf/VideoScreen';

describe('VideoScreen', () => {
  const noop = () => {};

  it('renders the explainer video with controls', () => {
    render(<VideoScreen onContinue={noop} />);
    const video = screen.getByTestId('icf-explainer-video');
    expect(video).toHaveAttribute('src', EXPLAINER_VIDEO_SRC);
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('playsinline');
  });

  it('pauses the video and calls onContinue when Weiter is clicked', () => {
    const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement
    ) {
      expect(this).toBe(screen.getByTestId('icf-explainer-video'));
    });
    const onContinue = jest.fn();
    try {
      render(<VideoScreen onContinue={onContinue} />);
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
      expect(pause).toHaveBeenCalledTimes(1);
      expect(onContinue).toHaveBeenCalledTimes(1);
      expect(pause.mock.invocationCallOrder[0]).toBeLessThan(
        onContinue.mock.invocationCallOrder[0]
      );
    } finally {
      pause.mockRestore();
    }
  });

  it('does not show mic error when micError is not provided', () => {
    const { container } = render(<VideoScreen onContinue={noop} />);
    expect(container.querySelector('.icf-audio-error')).not.toBeInTheDocument();
  });

  it('shows mic error when micError is provided', () => {
    const { container } = render(
      <VideoScreen onContinue={noop} micError="Mikrofon nicht verfügbar" />
    );
    expect(container.querySelector('.icf-audio-error')).toHaveTextContent(
      'Mikrofon nicht verfügbar'
    );
  });
});
