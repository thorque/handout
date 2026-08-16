import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Traefik cannot reach 127.0.0.1
    port: 5173,
    strictPort: true,
    allowedHosts: true, // dev only: must accept handout-5173.localhost AND the LAN
    // hostnames `monoceros share` uses. Ignored by `vite build`.
    proxy: {
      // The browser only ever talks to one origin; the service is reached under a
      // relative path. See docs/url-namespace.md.
      '/_handout/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    // Both extensions: the theme, route, contrast and token-only suites are plain .ts and
    // would silently never run under a .tsx-only pattern.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
