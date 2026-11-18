import { expect, test } from "@playwright/test";
import { Cavity, scene } from "../src/solver.ts";

test("square wall stops the jet and preserves cross-section flux", () => {
  const cavity = new Cavity({
    obstacle: { shape: "square", x: 0.5, y: 0.1875, size: 0.25 },
  });
  while (cavity.time < 1) cavity.step();
  const h = scene.gridSpacing;
  for (let i = 0; i < 8; i++) {
    const offset = (i + 0.5) * h;
    for (const x of [0.375, 0.625])
      expect(cavity.velocity(x, 0.0625 + offset)).toEqual([0, 0]);
    for (const y of [0.0625, 0.3125])
      expect(cavity.velocity(0.375 + offset, y)).toEqual([0, 0]);
  }
  for (const x of [0, 0.5, scene.width]) {
    let flow = 0;
    for (let y = h / 2; y < scene.height; y += h)
      flow += cavity.velocity(x, y)[0] * h;
    expect(Math.abs(flow / scene.flux - 1)).toBeLessThan(0.001);
  }
  expect(cavity.velocity(0.34, 0.27)[1]).toBeGreaterThan(0.05);
  expect(cavity.velocity(0.34, 0.09)[1]).toBeLessThan(-0.05);
});

test("apply, edit, restart and remove the obstacle", async ({ page }) => {
  await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2025-01-01T00:00:01Z"));
  await page.goto("/");
  const action = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const field = () =>
    page
      .locator(".velocity path")
      .evaluateAll((paths) => paths.map((p) => p.getAttribute("d")).join(""));
  const run = async () => {
    await action("Run");
    await page.clock.runFor(1024);
    await action("Pause");
    return field();
  };
  const empty = await run();
  await page.getByLabel("Shape").selectOption("square");
  await action("Apply");
  await expect(page.locator("#time")).toHaveText("0.00 s");
  const placed = await run();
  expect(placed).not.toBe(empty);
  const outline = page.locator("#obstacle");
  const original = await outline.getAttribute("d");
  expect(original).toBeTruthy();
  await page.getByLabel("Centre x").fill("1");
  await page.locator("#cavity-width").fill("1");
  await action("Apply");
  await expect(page.getByRole("alert")).toContainText("fluid cell");
  expect(await field()).toBe(placed);
  await action("Restart");
  await expect(outline).toHaveAttribute("d", original ?? "");
  await page.getByLabel("Centre x").fill("0.625");
  await page.getByLabel("Side length").fill("0.1875");
  await action("Apply");
  await expect(page.getByRole("alert")).toBeEmpty();
  expect(await outline.getAttribute("d")).not.toBe(original);
  await page.locator("#cavity-width").fill("1.5");
  await page.getByLabel("Shape").selectOption("none");
  await action("Apply");
  expect(await run()).toBe(empty);
});
