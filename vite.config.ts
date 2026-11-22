import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Content Security Policy for the production build.
 *
 * The browser enforces these rules on the app itself. Most importantly,
 * `connect-src 'self'` means the page CANNOT send data to any other server,
 * even if a bug or a compromised library tried to. That turns "nothing is
 * uploaded" from a promise into something the browser guarantees.
 *
 * Only applied to `npm run build`: the dev server needs a live websocket
 * connection for instant reloads, which this policy would block.
 * (`style-src 'unsafe-inline'` is needed for chart libraries that set inline styles.)
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'wealthflow-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`),
  }
}

// Vite builds and serves the app; the `test` block configures Vitest,
// which reuses this same config so tests see code exactly as the app does.
export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  // Vite's working cache lives OUTSIDE the project: this folder is synced by
  // OneDrive, and OneDrive locking cache files mid-rewrite can break pages.
  cacheDir: join(tmpdir(), 'wealthflow-vite-cache'),
  // Prepare every library up front, so the dev server never has to rebuild its
  // cache in the middle of a session (which can break pages already open).
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react-router', 'recharts', 'dexie', 'zustand', 'lucide-react', 'papaparse', 'jspdf', 'jspdf-autotable'],
  },
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than the app, so giving them their own
        // files means browsers can keep them cached across app updates.
        // Deliberately NO catch-all "node_modules" group: that would pull lazily
        // loaded libraries (jsPDF, PapaParse) back into the first download.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/ },
            {
              name: 'charts',
              test: /node_modules[\\/](recharts|d3-[a-z]+|victory-vendor|@reduxjs|react-redux|immer|reselect|decimal\.js-light|es-toolkit|eventemitter3|use-sync-external-store)[\\/]/,
            },
            { name: 'vendor', test: /node_modules[\\/](dexie|zustand|lucide-react)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
