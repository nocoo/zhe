import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    pool: 'threads',
    isolate: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['tests/playwright/**', 'node_modules/**'],
    // Increase default timeout for L2 API E2E tests which hit real HTTP endpoints
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      skipFull: true,
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
        // View/page components (presentation only)
        'app/**/page.tsx',
        'app/**/layout.tsx',
        // Large page components tested via E2E
        'components/dashboard/ideas-page.tsx',
        'components/dashboard/idea-editor-page.tsx',
        'components/dashboard/api-keys-page.tsx',
        // Presentation-only components
        'components/markdown-preview.tsx',
        // Editor viewmodel — tested via E2E
        'viewmodels/useIdeaEditorViewModel.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 85,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
