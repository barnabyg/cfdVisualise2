import { expect, test } from "@playwright/test";
import { Cavity, scene } from "../src/solver.ts";

for (const shape of ["square", "circle"] as const)
  test(`${shape} wall stops the jet and preserves cross-section flux`, () => {
    const cavity = new Cavity({
      obstacle: { shape, x: 0.5, y: 0.1875, size: 0.25 },
    });
    while (cavity.time < 1) cavity.step();
    const h = scene.gridSpacing;
    // An eight-cell diameter covers these cell-centre counts in successive rows.
    const widths =
      shape === "circle" ? [4, 6, 8, 8, 8, 8, 6, 4] : Array(8).fill(8);
    const inside = (col: number, row: number) =>
      row >= 0 && row < 8 && Math.abs(col + 0.5 - 4) < widths[row] / 2;
    for (let j = 0; j < 8; j++)
      for (let i = 0; i < 8; i++) {
        if (!inside(i, j)) continue;
        const x = 0.375 + (i + 0.5) * h,
          y = 0.0625 + (j + 0.5) * h;
        expect(cavity.velocity(x, y)).toEqual([0, 0]);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          if (inside(i + dx, j + dy)) continue;
          expect(cavity.velocity(x + (dx * h) / 2, y + (dy * h) / 2)).toEqual([
            0, 0,
          ]);
          // Approach the face from fluid to check the normal and tangential velocity limits.
          const near = cavity.velocity(
            x + dx * (h / 2 + 1e-9),
            y + dy * (h / 2 + 1e-9),
          );
          expect(Math.hypot(...near)).toBeLessThan(1e-6);
        }
      }
    if (shape === "circle")
      expect(
        Math.hypot(...cavity.velocity(0.390625, 0.078125)),
      ).toBeGreaterThan(0.01);
    for (const x of [0, 0.5, scene.width]) {
      let flow = 0;
      for (let y = h / 2; y < scene.height; y += h)
        flow += cavity.velocity(x, y)[0] * h;
      expect(Math.abs(flow / scene.flux - 1)).toBeLessThan(0.001);
    }
    expect(cavity.velocity(0.34, 0.27)[1]).toBeGreaterThan(0.05);
    expect(cavity.velocity(0.34, 0.09)[1]).toBeLessThan(-0.05);
  });

for (const editShape of ["square", "circle"] as const)
  test(`apply, edit, restart and remove the ${editShape}`, async ({ page }) => {
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
    await page.getByText("Flow conditions", { exact: true }).click();
    await page.getByLabel("Shape").selectOption("square");
    await action("Apply");
    await expect(page.locator("#time")).toHaveText("0.00 s");
    const placed = await run();
    expect(placed).not.toBe(empty);
    const outline = page.locator("#obstacle");
    const original = await outline.getAttribute("d");
    expect(original).toBeTruthy();
    let active = placed;
    let activeOutline = original;
    if (editShape === "circle") {
      await page.getByLabel("Shape").selectOption("circle");
      await expect(page.getByLabel("Diameter")).toHaveValue("0.25");
      await action("Apply");
      const circle = await run();
      expect(circle).not.toBe(placed);
      const circleOutline = await outline.getAttribute("d");
      expect(circleOutline).not.toBe(original);
      active = circle;
      activeOutline = circleOutline;
    }
    await page.getByLabel("Centre x").fill("1");
    await page.locator("#cavity-width").fill("1");
    await action("Apply");
    await expect(page.getByRole("alert")).toContainText("fluid cell");
    expect(await field()).toBe(active);
    await action("Restart");
    await expect(outline).toHaveAttribute("d", activeOutline ?? "");
    const bounds = () =>
      outline.evaluate((node) => {
        const { x, y, width, height } = (node as SVGGraphicsElement).getBBox();
        return [x, y, width, height];
      });
    await page.getByLabel("Centre x").fill("0.625");
    await action("Apply");
    expect(await bounds()).toEqual([200, 275, 100, 100]);
    await page
      .getByLabel(editShape === "circle" ? "Diameter" : "Side length")
      .fill("0.1875");
    await action("Apply");
    await expect(page.getByRole("alert")).toBeEmpty();
    expect(await bounds()).toEqual([212.5, 287.5, 75, 75]);
    await page.locator("#cavity-width").fill("1.5");
    await page.getByLabel("Shape").selectOption("none");
    await action("Apply");
    expect(await run()).toBe(empty);
  });
