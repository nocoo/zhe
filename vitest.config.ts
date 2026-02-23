import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/playwright/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'lib/**/*.ts',
        'models/links.ts',
        'models/backy.ts',
        'actions/**/*.ts',
        'middleware.ts',
        'viewmodels/**/*.ts',
        'hooks/**/*.tsx',
        'components/app-sidebar.tsx',
        'components/dashboard-shell.tsx',
        'components/theme-toggle.tsx',
        'components/dashboard/**/*.tsx',
        'app/**/page.tsx',
        'app/**/route.ts',
      ],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.config.*',
        '**/*.d.ts',
        '.next/',
        // Config/schema/type-only files
        'lib/db/schema.ts',
        'lib/palette.ts',
        // Thin wrappers
        'app/api/auth/**',
        // Shadcn/UI auto-generated primitives
        'components/ui/',
      ],
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
