// src/__tests__/components/common/DevBanner.test.tsx
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';
import DevBanner from '@/components/common/DevBanner';

// import.meta.env.DEV is patched to `undefined` by the jest transform (see
// jest-import-meta-transform.js), so in this test environment DevBanner
// always takes its "not in dev mode" branch and renders nothing.
describe('DevBanner', () => {
  it('renders nothing outside of dev mode', () => {
    const { container } = render(<DevBanner />);
    expect(container.firstChild).toBeNull();
  });
});
