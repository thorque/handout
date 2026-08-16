import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // The database suites create a schema, migrate it and drop it again; the default five
    // seconds are enough for none of that on a cold connection.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
