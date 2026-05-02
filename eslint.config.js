import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js', '**/*.mjs'],
    plugins: {
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Node.js 18+ globals
        fetch: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Runtime-specific globals
        Bun: 'readonly',
        Deno: 'readonly',
      },
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // Code quality rules
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off', // Allow console in this project
      'no-debugger': 'error',

      // Best practices
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-var': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error',
      'no-duplicate-imports': 'error',

      // ES6+ features
      'arrow-body-style': ['error', 'as-needed'],
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',

      // Async/await
      'no-async-promise-executor': 'error',
      // Adapter interfaces are uniformly async even when a particular
      // implementation has nothing to await — keeps consumers from caring
      // which backend they got handed.
      'require-await': 'off',

      // Comments and documentation
      'spaced-comment': ['error', 'always', { markers: ['/'] }],

      // Complexity rules - reasonable thresholds for maintainability
      complexity: ['warn', 15], // Cyclomatic complexity - allow more complex logic than strict 8
      'max-depth': ['warn', 5], // Maximum nesting depth - slightly more lenient than strict 4
      'max-lines-per-function': [
        'warn',
        {
          max: 150, // More reasonable than strict 50 lines per function
          skipBlankLines: true,
          skipComments: true,
        },
      ],
      'max-params': ['warn', 6], // Maximum function parameters - slightly more lenient than strict 5
      'max-statements': ['warn', 60], // Maximum statements per function - reasonable limit for orchestration functions
      'max-lines': ['error', 1500], // Maximum lines per file - counts all lines including blank lines and comments
    },
  },
  {
    // Test files have different requirements
    files: ['tests/**/*.js', '**/*.test.js'],
    rules: {
      'require-await': 'off', // Async functions without await are common in tests
    },
  },
  {
    // Browser-side SPA — needs DOM globals.
    files: ['src/web/**/*.js'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        location: 'readonly',
        confirm: 'readonly',
        alert: 'readonly',
      },
    },
  },
  {
    // Bun runtime adapter — uses globals shared with browsers.
    files: ['src/sync/bun-server.js'],
    languageOptions: {
      globals: {
        Response: 'readonly',
        Request: 'readonly',
        WebSocket: 'readonly',
      },
    },
  },
  {
    // Test files: setTimeout/clearTimeout are part of standard timers.
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      '*.min.js',
      '.eslintcache',
      // Case study raw data files (downloaded from external sources)
      'docs/case-studies/*/data/**',
    ],
  },
];
