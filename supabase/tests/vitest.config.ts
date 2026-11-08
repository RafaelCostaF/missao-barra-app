import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20_000,
    // realtime.test.ts e signup-flow.test.ts precisam do Supabase completo (npm run test:realtime).
    exclude: process.env.REALTIME ? [] : ['realtime.test.ts', 'signup-flow.test.ts', 'node_modules/**'],
  },
});
