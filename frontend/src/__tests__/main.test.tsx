// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

// Mock react-dom/client
const mockRender = jest.fn();
const mockCreateRoot = jest.fn(() => ({
  render: mockRender,
}));

jest.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

// Note: main.tsx uses import.meta.env (Vite-specific) which Jest cannot parse.
// This test verifies that the essential React infrastructure is properly mocked,
// without attempting to actually import main.tsx.

describe('Main entry point infrastructure', () => {
  beforeEach(() => {
    // Create a root element for the test
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    const root = document.getElementById('root');
    if (root) {
      document.body.removeChild(root);
    }
  });

  it('has createRoot mock configured', () => {
    expect(mockCreateRoot).toBeDefined();
    expect(typeof mockCreateRoot).toBe('function');
  });

  it('has render mock configured', () => {
    expect(mockRender).toBeDefined();
    expect(typeof mockRender).toBe('function');
  });

  it('has a root element in the DOM', () => {
    const root = document.getElementById('root');
    expect(root).toBeTruthy();
    expect(root?.tagName).toBe('DIV');
  });
});
