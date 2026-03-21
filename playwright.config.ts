/**
 * Playwright Configuration
 *
 * Uses testcontainers for per-worker isolation:
 * - Each worker gets its own PostgreSQL container
 * - Each worker gets its own API server on a dynamic port
 * - Each worker gets its own Vite preview server on a dynamic port
 *
 * MEMORY SAFETY:
 * - Each worker uses ~300-500MB (Postgres + API + Preview + Browser)
 * - Default is 4 workers locally = ~2GB (safe for most machines)
 * - Set PLAYWRIGHT_WORKERS env var to override
 * - If system has <4GB free RAM, reduce workers or close other apps
 *
 * HISTORY: Using 8 workers with vite dev (instead of preview) caused
 * a 90GB memory explosion and system crash. We now use vite preview
 * (lightweight static server) instead of vite dev (heavy HMR server).
 */

import { defineConfig, devices } from '@playwright/test';
import os from 'os';

// Calculate safe worker count based on available memory
function getWorkerCount(): number {
  // Allow explicit override via env var
  if (process.env.PLAYWRIGHT_WORKERS) {
    return parseInt(process.env.PLAYWRIGHT_WORKERS, 10);
  }

  // In CI, use 4 workers (CI runners typically have good resources)
  if (process.env.CI) {
    return 4;
  }

  // Locally, calculate based on available memory
  // Each worker needs: ~150MB Postgres + ~100MB API + ~50MB preview + ~200MB browser = ~500MB
  const freeMemGB = os.freemem() / (1024 * 1024 * 1024);
  const memPerWorker = 0.5; // 500MB per worker
  const reserveGB = 2; // Keep 2GB free for OS and other apps

  // Calculate memory-based limit
  const memoryBasedLimit = Math.floor((freeMemGB - reserveGB) / memPerWorker);

  // Also consider CPU cores - no point having more workers than cores
  const cpuCores = os.cpus().length;

  // Use the smaller of memory limit or CPU cores (no arbitrary cap - CPU cores is the natural limit)
  const finalCount = Math.max(1, Math.min(memoryBasedLimit, cpuCores));

  return finalCount;
}

// Calculate workers (logging happens in global-setup to avoid per-worker noise)
const calculatedWorkers = getWorkerCount();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,  // 1 retry locally for flaky WebSocket/timing tests
  workers: calculatedWorkers,
  // Reporters:
  // - 'line' shows real-time progress: [1/641] ✓ auth.spec.ts:15 (2.3s)
  // - 'html' generates detailed report at end
  // - './e2e/progress-reporter.ts' writes JSONL for live monitoring
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['./e2e/progress-reporter.ts']]
    : [['line'], ['html', { open: 'never' }], ['./e2e/progress-reporter.ts']],
  use: {
    // baseURL is provided by the isolated-env fixture
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Longer timeout for container startup
  timeout: 60000,
  // Global setup builds API and Web once before all workers
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // ---------- Category projects (run with --project=<name>) ----------
    {
      name: 'ui',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /bulk-selection|program-mode-week-ux|team-mode|drag-handle|admin-workspace-members|status-overview-heatmap|docs-mode|context-menus|request-changes-ui|manager-reviews(?!-visual)|tooltips|accountability-banner-urgency|icons|issues-bulk-operations|manager-reviews-visual|weekly-accountability/,
    },
    {
      name: 'content',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /mentions|tables|file-attachments|emoji|toggle|toc|syntax-highlighting|inline-comments|inline-code|images|backlinks/,
    },
    {
      name: 'data',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /workspaces|private-documents|programs|issues(?!-bulk)|issue-estimates|issue-display-id|pending-invites-allocation|existing-user-invite|project-weeks|documents|document-isolation|data-integrity|wiki-document-properties|changes-requested-notifications|accountability-owner-change|accountability-week|weeks/,
    },
    {
      name: 'security',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /session-timeout|security|authorization|auth\.spec|critical-blockers/,
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /accessibility-remediation|accessibility|check-aria|status-colors-accessibility/,
    },
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /performance/,
    },
    {
      name: 'api',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /ai-analysis-api|request-changes-api|search-api|file-upload-api/,
    },
    {
      name: 'integration',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /features-real|race-conditions|edge-cases|error-handling|real-integration|fleetgraph-use-cases|autosave-race-conditions|feedback-consolidation|content-caching|my-week-stale-data|document-workflows|accountability-standup/,
    },
  ],
  // NO webServer - the fixture handles server startup per worker
});
