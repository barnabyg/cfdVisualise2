import { geometry as renderedGeometry } from "./geometry.ts";
import { test, expect } from "@playwright/test";
test("the jet develops a visible return current and settles", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2025-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2025-01-01T00:00:01Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const field = page
    .getByRole("img", { name: "Cavity velocity field" })
    .locator(".velocity");
  // In the SVG viewBox, positive x points right and positive y points down.
  async function shafts() {
    const geometry = await renderedGeometry(field);
    return Array.from(
      (geometry ?? "").matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g),
      (m) => {
        const [, x, y, tipX, tipY] = m.map(Number);
        return {
          x: (x + tipX) / 2,
          y: (y + tipY) / 2,
          dx: tipX - x,
          dy: tipY - y,
        };
      },
    );
  }
  await page.clock.runFor(3000);
  const developing = await shafts();
  expect(
    developing.filter((s) => s.y > 300 && s.dx > 8).length,
  ).toBeGreaterThan(8);
  expect(
    developing.filter((s) => s.y < 270 && s.dx < -5).length,
  ).toBeGreaterThan(12);
  await page.clock.runFor(17000);
  const settled = await shafts();
  expect(
    parseFloat((await page.locator("#time").textContent()) ?? ""),
  ).toBeCloseTo(20, 0);
  const colours = () =>
    field
      .locator("path")
      .evaluateAll((paths) => paths.map((path) => path.getAttribute("stroke")));
  const settledColours = await colours();
  for (let frame = 0; frame < 12; frame++) {
    await page.clock.runFor(16);
    const currentColours = await colours();
    const changed = currentColours.filter(
      (colour, index) => colour !== settledColours[index],
    ).length;
    expect(changed).toBeLessThan(settledColours.length * 0.01);
  }

  await page.clock.runFor(4000);
  const later = await shafts();
  await expect(page.getByRole("status")).toHaveText("Converged");
  expect(
    parseFloat((await page.locator("#time").textContent()) ?? ""),
  ).toBeCloseTo(21, 0);
  for (const sample of [settled, later]) {
    expect(
      sample.some((s) => s.x < 20 && s.y > 300 && s.y < 375 && s.dx > 8),
    ).toBe(true);
    expect(
      sample.some((s) => s.x > 580 && s.y > 25 && s.y < 100 && s.dx > 8),
    ).toBe(true);
  }
  expect(later).toHaveLength(settled.length);
  const maxDrift = Math.max(
    ...later.map((s, i) =>
      Math.hypot(s.dx - settled[i].dx, s.dy - settled[i].dy),
    ),
  );
  expect(maxDrift).toBeLessThan(1);
});
