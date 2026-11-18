import { defineConfig } from "@playwright/test";
import { createHash } from "node:crypto";
const checkoutId = createHash("sha256")
  .update(process.cwd())
  .digest()
  .readUInt16BE();
const port = Number(
  process.env.CAVITY_TEST_PORT ?? 10000 + (checkoutId % 30000),
);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw Error("Invalid CAVITY_TEST_PORT");
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  maxFailures: process.env.CI ? 1 : 0,
  timeout: 90000,
  use: {
    baseURL,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    timeout: 90000,
  },
});
