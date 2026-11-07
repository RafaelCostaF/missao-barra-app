import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20_000,
    // realtime.test.ts precisa do Supabase completo (npm run test:realtime).
    exclude: process.env.REALTIME ? [] : ['realtime.test.ts', 'node_modules/**'],
  },
});
