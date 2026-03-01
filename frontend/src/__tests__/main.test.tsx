import '@/main';
jest.mock('@/api/client', () => require('@/__mocks__/api/client'));

// Mock react-dom/client
jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(),
  })),
}));

describe('Main entry point', () => {
  it('renders without crashing', () => {
    expect(() => {
      require('@/main');
    }).not.toThrow();
  });
});
