import '../../src/main'; // ✅ Import your main file directly
jest.mock('../../src/api/client', () => require('../../src/__mocks__/api/client'));

// src/__tests__/main.test.tsx

jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({
    render: jest.fn(), // Mock the render method
  })),
}));

describe('Main entry point', () => {
  it('renders without crashing', () => {
    expect(() => {
      require('../../src/main'); // Import AFTER mocking createRoot
    }).not.toThrow();
  });
});
