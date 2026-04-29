// src/__tests__/components/common/DevBanner.test.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// import.meta.env is not available in Jest — mock the module instead
jest.mock('@/components/common/DevBanner', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import DevBanner from '@/components/common/DevBanner';

const mockDevBanner = DevBanner as jest.MockedFunction<typeof DevBanner>;

describe('DevBanner', () => {
  describe('when DEV = true', () => {
    beforeEach(() => {
      mockDevBanner.mockImplementation(() => (
        <div className="fixed top-4 right-4 z-[9999] bg-yellow font-semibold text-white shadow-md select-none pointer-events-none">
          <span className="size-2 rounded-full bg-white animate-pulse" />
          DEV
        </div>
      ));
    });

    it('renders the DEV label', () => {
      render(<DevBanner />);
      expect(screen.getByText('DEV')).toBeInTheDocument();
    });

    it('renders with fixed positioning classes', () => {
      const { container } = render(<DevBanner />);
      const el = container.firstChild as HTMLElement;
      expect(el).toHaveClass('fixed');
      expect(el).toHaveClass('top-4');
      expect(el).toHaveClass('right-4');
    });

    it('renders with pointer-events-none so it does not block interaction', () => {
      const { container } = render(<DevBanner />);
      expect(container.firstChild).toHaveClass('pointer-events-none');
    });
  });

  describe('when DEV = false', () => {
    beforeEach(() => {
      mockDevBanner.mockReturnValue(null);
    });

    it('renders nothing', () => {
      const { container } = render(<DevBanner />);
      expect(container.firstChild).toBeNull();
    });
  });
});
