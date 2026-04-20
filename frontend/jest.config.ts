import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: '<rootDir>/jest-env-location-patch.cjs',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': '<rootDir>/jest-import-meta-transform.js',
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  moduleNameMapper: {
    '\\.svg\\?react$': '<rootDir>/src/__mocks__/svgReactMock.js',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/src/__mocks__/fileMock.js',
    '\\.(css|scss|sass)$': 'identity-obj-proxy',
    '^@/(.*)$': '<rootDir>/src/$1',
    '^.*/config/interventions\\.json$': '<rootDir>/src/__mocks__/interventions.config.json',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@react|react-dom|mobx-react-lite)/)',
    '/node_modules/(?!axios)',
  ],
  testMatch: ['**/__tests__/**/*.(ts|tsx)', '**/?(*.)+(spec|test).(ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/main.tsx',
    '!src/routes/index.tsx',
  ],
  coverageDirectory: 'coverage',
  collectCoverage: true,
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90,
    },
  },
  clearMocks: true,
};

export default config;
