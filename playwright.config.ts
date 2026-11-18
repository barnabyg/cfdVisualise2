import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  maxFailures: process.env.CI ? 1 : 0,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:4183",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "npm run dev -- --port 4183",
    url: "http://127.0.0.1:4183",
    timeout: 90000,
  },
});
