import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3311);

/**
 * End-to-end tests run against a production build in replay mode, so they need
 * no API key and cost nothing. `pnpm e2e` builds first.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      PENNY_MODE: "replay",
      PENNY_REPLAY_PACE: "0.1",
      PENNY_PAY_DELAY_MS: "150",
      PENNY_RATE_PER_MINUTE: "500",
    },
  },
});
