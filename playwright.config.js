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
const isLive = argv.some((a, i) => a === '--project=live' || (a === '--project' && argv[i + 1] === 'live'));
const liveEnv = isLive ? require('./e2e/support/live-env.js').readLiveEnv() : null;

module.exports = defineConfig({
  testDir: 'e2e',
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
        env: { ...MOCK_ENV, BUILD_PATH: 'build-e2e', GENERATE_SOURCEMAP: 'false' },
      },
  projects: [
    { name: 'mobile', testIgnore: /live\//, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', testIgnore: /live\//, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'live', testMatch: /live\/.*\.spec\.js/, retries: 0, workers: 1, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
