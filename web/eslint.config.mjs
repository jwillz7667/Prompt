import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier'

export default defineConfig([
  ...nextVitals,
  prettier,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'react/no-unescaped-entities': 'warn',
      '@next/next/next-script-for-ga': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      // Preserve visibility of legacy React Compiler diagnostics during the
      // framework migration. The compiler is not enabled for this app.
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'public/workbox-*.js',
    'public/worker-*.js',
  ]),
])
