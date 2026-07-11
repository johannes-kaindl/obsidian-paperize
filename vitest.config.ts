import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'scripts/**/*.test.ts'] },
  resolve: {
    alias: {
      // The real 'obsidian' package has no JS entrypoint (types only), which
      // breaks Vite's resolver even when a test supplies vi.mock('obsidian', ...).
      // Alias it to a local stub so resolution succeeds; per-test vi.mock calls
      // still take precedence for the actual mocked shape.
      obsidian: path.resolve(__dirname, './tests/__mocks__/obsidian.ts'),
    },
  },
});
