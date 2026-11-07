import { defineConfig } from '@playwright/test';

// Requer o Supabase local (`npx supabase start`) e os dados de `npm run demo` + `npm run simulate`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5179', viewport: { width: 1400, height: 900 }, screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite --port 5179 --strictPort --host 127.0.0.1', url: 'http://127.0.0.1:5179', reuseExistingServer: true },
});
