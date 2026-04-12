import { act, render, renderHook, screen } from '@testing-library/react';
import PwaInstallSheet, { useIsStandalone } from '@/components/PwaInstallSheet';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/sheet', () => {
  const React = require('react');
  return {
    Sheet: ({ open, children }: { open?: boolean; children: React.ReactNode }) =>
      open ? React.createElement(React.Fragment, null, children) : null,
    SheetContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children),
    SheetTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', null, children),
    SheetDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', null, children),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMatchMediaMock(matches: boolean) {
  const listeners: ((e: MediaQueryListEvent) => void)[] = [];
  const mq = {
    matches,
    addEventListener: jest.fn((_type: string, fn: (e: MediaQueryListEvent) => void) => {
      listeners.push(fn);
    }),
    removeEventListener: jest.fn((_type: string, fn: (e: MediaQueryListEvent) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    }),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockReturnValue(mq),
  });
  return {
    triggerChange: (val: boolean) => {
      act(() => {
        listeners.forEach((fn) => fn({ matches: val } as MediaQueryListEvent));
      });
    },
  };
}

const originalUserAgent = navigator.userAgent;

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
}

// ─── useIsStandalone ────────────────────────────────────────────────────────

describe('useIsStandalone', () => {
  afterEach(() => setUserAgent(originalUserAgent));

  it('returns false when not in standalone mode', () => {
    createMatchMediaMock(false);
    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(false);
  });

  it('returns true when display-mode is standalone', () => {
    createMatchMediaMock(true);
    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(true);
  });

  it('updates when the media query fires a change event', () => {
    const { triggerChange } = createMatchMediaMock(false);
    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(false);
    triggerChange(true);
    expect(result.current).toBe(true);
  });

  it('cleans up the event listener on unmount', () => {
    const { triggerChange } = createMatchMediaMock(false);
    const { result, unmount } = renderHook(() => useIsStandalone());
    unmount();
    // triggering after unmount should not throw or update state
    expect(() => triggerChange(true)).not.toThrow();
    expect(result.current).toBe(false);
  });
});

// ─── PwaInstallSheet ────────────────────────────────────────────────────────

describe('PwaInstallSheet', () => {
  afterEach(() => setUserAgent(originalUserAgent));

  it('renders nothing when closed', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/109 Safari/537.36');
    render(<PwaInstallSheet open={false} onOpenChange={jest.fn()} />);
    expect(screen.queryByText('pwa.title')).not.toBeInTheDocument();
  });

  it('renders title and description when open', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/109 Safari/537.36');
    render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText('pwa.title')).toBeInTheDocument();
    expect(screen.getByText('pwa.description')).toBeInTheDocument();
  });

  // ── iOS ───────────────────────────────────────────────────────────────────

  describe('iOS - Safari', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    );

    it('shows iOS install instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.queryByText('pwa.ios.note')).not.toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step3')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step4')).toBeInTheDocument();
    });

    it('does not show Android or Desktop instructions on iOS', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.queryByText('pwa.android.chrome.step1')).not.toBeInTheDocument();
      expect(screen.queryByText('pwa.desktop.chromium.step1')).not.toBeInTheDocument();
    });
  });

  describe('iOS – Chrome (non-Safari)', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/109.0.0.0 Mobile/15E148 Safari/604.1'
      )
    );

    it('shows the Safari note when not on Safari', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.ios.note')).toBeInTheDocument();
    });

    it('still shows the iOS install steps', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.ios.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step3')).toBeInTheDocument();
      expect(screen.getByText('pwa.ios.step4')).toBeInTheDocument();
    });
  });

  // ── Android ───────────────────────────────────────────────────────────────

  describe('Android – Chrome', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
      )
    );

    it('shows Android Chrome instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.android.chrome.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.chrome.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.chrome.step3')).toBeInTheDocument();
    });
  });

  describe('Android – Firefox', () => {
    beforeEach(() =>
      setUserAgent('Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/109.0')
    );

    it('shows Android Firefox instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.android.firefox.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.firefox.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.firefox.step3')).toBeInTheDocument();
    });
  });

  describe('Android – Samsung Internet', () => {
    beforeEach(() =>
      // UA must avoid 'Chrome', 'Safari', 'Firefox', 'Edg', 'Opera'/'OPR'
      // so getBrowserName() reaches the SamsungBrowser branch and returns 'Samsung Internet'
      setUserAgent('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/20.0')
    );

    it('shows Android Samsung Internet instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.android.samsung.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.samsung.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.samsung.step3')).toBeInTheDocument();
    });
  });

  describe('Android – generic browser', () => {
    beforeEach(() =>
      setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 OtherBrowser/1.0')
    );

    it('shows generic Android instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.android.generic.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.generic.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.android.generic.step3')).toBeInTheDocument();
    });
  });

  // ── Desktop ───────────────────────────────────────────────────────────────

  describe('Desktop – Chrome', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
      )
    );

    it('shows Chromium desktop instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.desktop.chromium.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.desktop.chromium.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.desktop.chromium.step3')).toBeInTheDocument();
    });
  });

  describe('Desktop – Edge', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/109.0.0.0 Safari/537.36 Edg/109.0.1518.78'
      )
    );

    it('shows Chromium desktop instructions for Edge', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.desktop.chromium.step1')).toBeInTheDocument();
    });
  });

  describe('Desktop – Safari', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      )
    );

    it('shows Safari desktop instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.desktop.safari.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.desktop.safari.step2')).toBeInTheDocument();
      expect(screen.getByText('pwa.desktop.safari.step3')).toBeInTheDocument();
    });
  });

  describe('Desktop – Firefox', () => {
    beforeEach(() =>
      setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0'
      )
    );

    it('shows Firefox desktop instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.desktop.firefox.step1')).toBeInTheDocument();
    });
  });

  describe('Desktop – generic browser', () => {
    beforeEach(() => setUserAgent('Mozilla/5.0 (Windows NT 10.0) Opera/109.0'));

    it('shows generic desktop instructions', () => {
      render(<PwaInstallSheet open={true} onOpenChange={jest.fn()} />);
      expect(screen.getByText('pwa.desktop.generic.step1')).toBeInTheDocument();
      expect(screen.getByText('pwa.desktop.generic.step2')).toBeInTheDocument();
    });
  });
});
