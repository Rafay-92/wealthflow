import { defineConfig } from '@playwright/test'

/**
 * End-to-end tests: the real app in a real browser.
 *
 * - Uses the Microsoft Edge already installed on Windows (`channel: 'msedge'`),
 *   so no browser download is needed. Use `channel: 'chrome'` on a Mac with Chrome.
 * - Every run builds the app and starts a FRESH production preview server.
 *   (A preview server left running across a rebuild can serve stale files.)
 * - Each test gets a brand-new browser profile, so its IndexedDB starts empty.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
