// Enable custom matchers like toBeInTheDocument, toHaveAttribute, etc.
import '@testing-library/jest-dom';
beforeAll(() => {
  const originalWarn = console.warn;

  jest.spyOn(console, 'warn').mockImplementation((msg, ...args) => {
    if (
      typeof msg === 'string' &&
      (msg.includes('React Router Future Flag Warning') ||
        msg.includes('React Router will begin wrapping state updates') ||
        msg.includes('Relative route resolution within Splat routes is changing'))
    ) {
      return; // 🚫 Suppress these warnings
    }
    originalWarn(msg, ...args); // Pass through other warnings
  });
});
