// ESLint flat config (ESLint 9+) for the Promptomize backend.
// Conservative ruleset: errors only for things that are almost always bugs.
// Stylistic rules are warnings so the team can tighten them over time without
// breaking CI on the existing codebase.
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'prisma/migrations/**',
      '**/*.template.ts',
    ],
  },

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // Type-aware lint is intentionally disabled — it requires a project
        // reference and would produce noise on the existing codebase. Re-enable
        // (and uncomment the type-aware rules below) when the team is ready.
        // project: './tsconfig.json',
        // tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        NodeJS: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
    },
    rules: {
      // ─── Hard errors (real bugs) ────────────────────────────────────────
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-throw-literal': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',

      // ─── Unused variables (allow leading-underscore convention) ─────────
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // ─── Style preferences (warnings) ───────────────────────────────────
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'import/no-duplicates': 'warn',

      // ─── Best practices ─────────────────────────────────────────────────
      'prefer-const': 'warn',
      'prefer-template': 'warn',
      eqeqeq: ['warn', 'always', { null: 'ignore' }],
      'object-shorthand': 'warn',

      // ─── Type-aware rules (off — see parserOptions comment) ─────────────
      // '@typescript-eslint/no-misused-promises': 'error',
      // '@typescript-eslint/no-floating-promises': 'error',
      // '@typescript-eslint/await-thenable': 'error',
      // '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      // '@typescript-eslint/prefer-optional-chain': 'warn',

      // ─── Off (the codebase legitimately needs these patterns) ───────────
      'no-console': 'off',
      'import/extensions': 'off',
      'import/order': 'off',
    },
  },

  // Disable any rule that conflicts with Prettier formatting.
  prettierConfig,
];
