// Downgrades a preset's 'error' rules to 'warn' so an adopted ruleset's backlog doesn't fail lint outright.
const asWarnings = (rules) =>
  Object.fromEntries(
    Object.entries(rules).map(([rule, severity]) => {
      const [level, ...rest] = Array.isArray(severity) ? severity : [severity];
      const newLevel = level === 'off' || level === 0 ? 'off' : 'warn';
      return [rule, rest.length ? [newLevel, ...rest] : newLevel];
    })
  );

const jsxA11yWarnRules = asWarnings(require('eslint-plugin-jsx-a11y').configs.recommended.rules);
const i18nextWarnRules = asWarnings(require('eslint-plugin-i18next').configs.recommended.rules);
const testingLibraryWarnRules = asWarnings(
  require('eslint-plugin-testing-library').configs.react.rules
);
const jestDomWarnRules = asWarnings(require('eslint-plugin-jest-dom').configs.recommended.rules);

module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended', // ✅ Enables eslint-plugin-prettier + eslint-config-prettier
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: [
    'react',
    'react-hooks',
    'jsx-a11y',
    '@typescript-eslint',
    'react-refresh',
    'i18next',
    'prettier',
  ],
  rules: {
    ...jsxA11yWarnRules,
    ...i18nextWarnRules,
    'i18next/no-literal-string': ['warn', { 'jsx-components': { exclude: ['code'] } }],
    'prettier/prettier': ['error'],
    'react/react-in-jsx-scope': 'off', // if using React 17+
    '@typescript-eslint/no-unused-vars': ['warn'],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'react/prop-types': 'off',
      },
    },
    {
      files: [
        'src/**/__tests__/**/*.[jt]s?(x)',
        'src/**/*.test.[jt]s?(x)',
        'src/**/*.spec.[jt]s?(x)',
      ],
      plugins: ['testing-library', 'jest-dom'],
      rules: {
        ...testingLibraryWarnRules,
        ...jestDomWarnRules,
        'i18next/no-literal-string': 'off',
      },
    },
    {
      files: ['src/__mocks__/**/*.[jt]s?(x)'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
    {
      // .cjs is CommonJS by design, so require() here is correct, not a violation.
      files: ['.eslintrc.cjs'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
