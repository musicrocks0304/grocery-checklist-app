// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const MOCK_ENV = {
  BROWSER: 'none',
  CI: 'true',
  PORT: '3000',
  REACT_APP_API_BASE_URL: 'http://n8n.test/webhook',
  REACT_APP_CLIP_SERVER_URL: 'http://clip.test',
  REACT_APP_API_KEY: 'e2e-key',
};

const argv = process.argv;
const argvIsLive = argv.some((a, i) => a === '--project=live' || (a === '--project' && argv[i + 1] === 'live'));
// Playwright forks a fresh node process per worker (child_process.fork,
// which by default copies process.env at fork time but never the parent's
// argv), and that worker re-requires this file to know which project it's
// running. Detecting `--project=live` from argv alone is therefore only
// ever true in the CLI process itself — every worker recomputes isLive as
// false, collects [mobile, desktop], and dies with "Project live not found
// in the worker process." Stamping an env var here (before Playwright
// forks anything) survives into the worker's inherited env, so both
// processes agree.
if (argvIsLive) process.env.PW_LIVE_PROJECT = '1';
// The env-var fallback is honoured only inside a Playwright worker process
// (guarded by TEST_WORKER_INDEX, which Playwright's WorkerMain constructor
// sets before this file is ever re-required for that worker — see
// node_modules/playwright/lib/worker/workerProcessEntry.js). Without that
// guard, a shell that happens to export PW_LIVE_PROJECT=1 (e.g. left over
// from a previous `--project=live` run) would make even a bare
// `npx playwright test` in the CLI process compute isLive === true and
// drive the production backend. Inside a worker the guard is a no-op: the
// worker always carries TEST_WORKER_INDEX, so PW_LIVE_PROJECT set by the
// stamp above (or inherited from the parent shell together with an
// explicit `--project=live`) still reaches it.
const isLive = argvIsLive || (process.env.PW_LIVE_PROJECT === '1' && process.env.TEST_WORKER_INDEX !== undefined);
const liveEnv = isLive ? require('./e2e/support/live-env.js').readLiveEnv() : null;

// The project set is derived from the same `isLive` flag that selects the
// webServer, so the two can never disagree: a bare `npx playwright test`
// (isLive === false, even with PW_LIVE_PROJECT=1 exported in the shell —
// the CLI process itself has no TEST_WORKER_INDEX) can only ever collect/run
// the hermetic projects, and `--project=live` (or `--project live`) can only
// ever collect/run the live project. testIgnore is set at the top level (not
// per-project) so that e2e/live/support.js — which reads the real .env key
// at module scope — is never even required unless the operator explicitly
// asked for `live`.
const mobileProject = { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Chicago' } };
const desktopProject = { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, timezoneId: 'America/Chicago' } };
const liveProject = {
  name: 'live',
  testMatch: /live\/.*\.spec\.js/,
  retries: 0,
  workers: 1,
  // Never trace/screenshot the live project — a Playwright trace records
  // full request headers, so a live failure would otherwise write the real
  // `X-API-Key` (plus screenshots of real data) to test-results/.
  use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, trace: 'off', screenshot: 'off' },
};

module.exports = defineConfig({
  testDir: 'e2e',
  testIgnore: isLive ? undefined : /live\//,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  // Hermetic (mobile/desktop) projects run against a production build, not the
  // CRA dev server: React StrictMode double-invokes effects/updaters in dev,
  // which double-fires some mutating requests and makes exact request-count
  // assertions unreliable (Ruling 5). BUILD_PATH writes to build-e2e/ so this
  // never touches the developer's own build/ output. The `live` project still
  // uses the dev server against real .env values below.
  webServer: isLive
    ? {
        command: 'npx react-scripts start',
        port: 3000,
        reuseExistingServer: !process.env.CI,
        timeout: 180000,
        env: { ...MOCK_ENV, ...liveEnv },
      }
    : {
        command: 'npx react-scripts build && npx serve -s build-e2e -l 3000 --no-clipboard',
        port: 3000,
        reuseExistingServer: false,
        timeout: 240000,
        // stdout defaults to 'ignore' — without piping it, a failed
        // `react-scripts build` ("Failed to compile" + the offending file,
        // printed to stdout) is swallowed and all you see is "Process from
        // config.webServer exited early."
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...MOCK_ENV, BUILD_PATH: 'build-e2e', GENERATE_SOURCEMAP: 'false' },
      },
  projects: isLive ? [liveProject] : [mobileProject, desktopProject],
});
