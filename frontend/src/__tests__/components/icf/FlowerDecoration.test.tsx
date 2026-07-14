import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FlowerSides, FlowerButtonRow } from '@/components/icf/FlowerDecoration';

describe('FlowerSides', () => {
  it('renders a left-column flower with a "right" positioned style', () => {
    const { container } = render(<FlowerSides />);
    const images = container.querySelectorAll('img.icf-flower-side');
    expect(images.length).toBe(8);

    const leftFlower = images[0] as HTMLImageElement;
    expect(leftFlower.style.right).toContain('75px');
    expect(leftFlower.style.left).toBe('');
  });

  it('renders a right-column flower with a "left" positioned style', () => {
    const { container } = render(<FlowerSides />);
    const images = container.querySelectorAll('img.icf-flower-side');
    const rightFlower = images[5] as HTMLImageElement;
    expect(rightFlower.style.left).toContain('96px');
    expect(rightFlower.style.right).toBe('');
  });

  it('applies a rotate transform when a flower has a rotate value', () => {
    const { container } = render(<FlowerSides />);
    const images = container.querySelectorAll('img.icf-flower-side');
    expect((images[0] as HTMLImageElement).style.transform).toBe('rotate(-10deg)');
  });
});

describe('FlowerButtonRow', () => {
  it('splits flowers into left and right groups around the children', () => {
    const { container, getByText } = render(
      <FlowerButtonRow>
        <button>Continue</button>
      </FlowerButtonRow>
    );
    expect(getByText('Continue')).toBeInTheDocument();
    const groups = container.querySelectorAll('.icf-flower-bottom-group');
    expect(groups).toHaveLength(2);
    expect(groups[0].querySelectorAll('img.icf-flower-bottom')).toHaveLength(2);
    expect(groups[1].querySelectorAll('img.icf-flower-bottom')).toHaveLength(2);
  });

  it('applies the rotate transform and a numeric offsetY for a flower with both set', () => {
    const { container } = render(
      <FlowerButtonRow>
        <span />
      </FlowerButtonRow>
    );
    const firstFlower = container.querySelectorAll('img.icf-flower-bottom')[0] as HTMLImageElement;
    expect(firstFlower.style.transform).toBe('');

    const secondFlower = container.querySelectorAll('img.icf-flower-bottom')[1] as HTMLImageElement;
    expect(secondFlower.style.transform).toBe('rotate(10deg)');
    expect(secondFlower.style.top).toBe('-16px');
  });

  it('forwards a custom style prop to the row container', () => {
    const { container } = render(
      <FlowerButtonRow style={{ marginTop: 12 }}>
        <span />
      </FlowerButtonRow>
    );
    const row = container.querySelector('.icf-btn-row') as HTMLElement;
    expect(row.style.marginTop).toBe('12px');
  });
});
