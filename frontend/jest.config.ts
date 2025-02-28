import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  moduleNameMapper: {
    "\\.(css|scss|sass)$": "identity-obj-proxy", // ✅ Handle CSS imports in Jest
    "^@/(.*)$": "<rootDir>/src/$1" // ✅ Allow absolute imports with "@/"
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@react|react-dom|mobx-react-lite)/)", // ✅ Ensure Jest processes ES Modules
  ],
};

export default config;
