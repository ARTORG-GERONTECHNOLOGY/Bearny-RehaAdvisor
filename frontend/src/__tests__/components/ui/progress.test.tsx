import { render } from '@testing-library/react';
import { Progress } from '@/components/ui/progress';
import '@testing-library/jest-dom';

describe('Progress', () => {
  it('renders the progress root', () => {
    const { container } = render(<Progress value={50} />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('applies base classes to the root', () => {
    const { container } = render(<Progress value={50} />);
    const el = container.firstChild;
    expect(el).toHaveClass('relative');
    expect(el).toHaveClass('h-2');
    expect(el).toHaveClass('w-full');
    expect(el).toHaveClass('overflow-hidden');
    expect(el).toHaveClass('rounded-full');
    expect(el).toHaveClass('bg-chartMuted');
  });

  it('merges custom className on the root', () => {
    const { container } = render(<Progress value={50} className="my-progress" />);
    expect(container.firstChild).toHaveClass('my-progress');
  });

  it('translates the indicator based on value', () => {
    const { container } = render(<Progress value={30} />);
    const indicator = container.querySelector('[style]') as HTMLElement;
    expect(indicator).toHaveStyle('transform: translateX(-70%)');
  });

  it('treats a missing value as 0 progress', () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector('[style]') as HTMLElement;
    expect(indicator).toHaveStyle('transform: translateX(-100%)');
  });

  it('applies a custom indicatorClassName', () => {
    const { container } = render(<Progress value={50} indicatorClassName="my-indicator" />);
    const indicator = container.querySelector('[style]') as HTMLElement;
    expect(indicator).toHaveClass('my-indicator');
    expect(indicator).toHaveClass('bg-primary');
  });
});
