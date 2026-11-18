import { geometry as renderedGeometry } from "./geometry.ts";
import { expect, test } from "@playwright/test";
test("hold, continue and replay a developing field", async ({ page }) => {
  await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2025-01-01T00:00:01Z"));
  await page.goto("/");
  const action = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const arrows = page.locator(".velocity");
  const time = page.locator("#time");
  const seconds = async () =>
    Number.parseFloat((await time.textContent()) ?? "");
  await action("Run");
  await page.clock.runFor(2000);
  const original = await renderedGeometry(arrows);
  await action("Pause");
  const paused = await seconds();
  await page.clock.runFor(12000);
  expect(await seconds()).toBe(paused);
  expect(await renderedGeometry(arrows)).toBe(original);
  await action("Resume");
  await page.clock.runFor(300);
  expect(await seconds()).toBeGreaterThan(paused + 0.2);
  expect(await seconds()).toBeLessThan(paused + 0.35);
  expect(await renderedGeometry(arrows)).not.toBe(original);
  for (const state of ["running", "paused"]) {
    if (state === "paused") await action("Pause");
    await action("Restart");
    await page.clock.runFor(200);
    expect(await seconds()).toBe(0);
    await expect.poll(() => renderedGeometry(arrows)).toBe("");
    await action("Run");
    await page.clock.runFor(2000);
    expect(await seconds()).toBeCloseTo(paused, 1);
    // Compare rendered coordinates with sub-pixel tolerance at comparable times.
    const coords = (path: string | null) =>
      Array.from((path ?? "").matchAll(/-?\d+\.\d+/g), (m) => Number(m[0]));
    const before = coords(original),
      after = coords(await renderedGeometry(arrows));
    expect(after.length).toBeGreaterThan(0);
    expect(after.length).toBe(before.length);
    expect(
      Math.max(...after.map((v, i) => Math.abs(v - before[i]))),
    ).toBeLessThan(1);
  }
});

test("a converged run holds its final field until restarted", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2025-01-01T00:00:01Z"));
  await page.goto("/");
  await page.getByLabel("Grid density").selectOption({ label: "Sparse" });
  const run = page.getByRole("button", { name: "Run", exact: true });
  const status = page.getByRole("status");
  const time = page.locator("#time");
  const arrows = page.locator(".velocity");

  await run.click();
  await page.clock.runFor(2000);
  await expect(status).toHaveText("Running");
  await page.clock.runFor(23000);
  await expect(status).toHaveText("Converged");
  await expect(run).toBeDisabled();
  const finalTime = await time.textContent();
  const finalField = await renderedGeometry(arrows);
  expect(finalField).not.toBe("");
  await page.clock.runFor(5000);
  await expect(time).toHaveText(finalTime ?? "");
  expect(await renderedGeometry(arrows)).toBe(finalField);

  await page.getByRole("button", { name: "Restart" }).click();
  await expect(status).toHaveText("At rest");
  await expect(time).toHaveText("0.00 s");
  await run.click();
  await page.clock.runFor(2000);
  await expect(status).toHaveText("Running");
});
