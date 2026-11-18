import {defineConfig} from '@playwright/test';
const executablePath = process.env.MODEL_EVAL_TEST_BROWSER;

export default defineConfig({
  testDir: 'tests/ui',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:43189',
    trace: 'retain-on-failure',
    ...(executablePath ? {launchOptions: {executablePath}} : {}),
  },
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
  webServer: {command: 'node scripts/preview.mjs', url: 'http://127.0.0.1:43189', reuseExistingServer: false},
});
