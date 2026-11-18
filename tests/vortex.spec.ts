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
    .locator("path.velocity");
  // In the SVG viewBox, positive x points right and positive y points down.
  async function shafts() {
    const geometry = await field.getAttribute("d");
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
  await page.clock.runFor(4000);
  const later = await shafts();
  expect(later).toHaveLength(settled.length);
  const maxDrift = Math.max(
    ...later.map((s, i) =>
      Math.hypot(s.dx - settled[i].dx, s.dy - settled[i].dy),
    ),
  );
  expect(maxDrift).toBeLessThan(1);
});
