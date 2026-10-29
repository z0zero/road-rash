import { defineConfig, devices } from "@playwright/test";

// The smoke test runs against the static export in out/ (build it first with
// `npm run build`). `next start` cannot serve a static export, so a static file
// server does. PORT lets several checkouts run the smoke test side by side.
const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npx serve out --listen tcp://127.0.0.1:${port} --no-port-switching --no-clipboard --no-request-logging`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
