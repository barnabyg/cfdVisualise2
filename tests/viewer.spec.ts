import { geometry as renderedGeometry } from "./geometry.ts";
import { test, expect } from "@playwright/test";
test("Run develops directional arrows from still fluid", async ({ page }) => {
  await page.goto("/");
  const field = page.getByRole("img", { name: "Cavity velocity field" });
  await expect(field).toBeVisible();
  const arrows = field.locator(".velocity");
  await expect.poll(() => renderedGeometry(arrows)).toBe("");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect.poll(() => renderedGeometry(arrows)).toMatch(/L/);
});

test("change the display grid while inspecting a paused field", async ({
  page,
}) => {
  await page.goto("/");
  const density = page.getByLabel("Grid density");
  const arrows = page.locator(".velocity path");
  await expect(arrows).toHaveCount(384);
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#outflow")).toHaveText("0.1875");
  await page.getByRole("button", { name: "Pause" }).click();
  const time = (await page.locator("#time").textContent()) ?? "";
  for (const [label, count, spacing] of [
    ["Sparse", 96, "50"],
    ["Dense", 1536, "12.5"],
  ] as const) {
    await density.selectOption({ label });
    await expect(arrows).toHaveCount(count);
    await expect(page.locator("#dots")).toHaveAttribute("width", spacing);
    await expect
      .poll(() => renderedGeometry(page.locator(".velocity")))
      .toMatch(/L/);
    await expect(page.locator("#time")).toHaveText(time);
    await expect(page.getByRole("status")).toHaveText("Paused");
  }
  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(arrows).toHaveCount(384);
});

test("apply, reject, restart and restore an inlet rate", async ({ page }) => {
  await page.goto("/");
  const rate = page.getByLabel("Inlet rate");
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  await rate.fill("0.09375");
  await click("Apply");
  await click("Run");
  await expect(page.locator("#outflow")).toHaveText("0.09375");
  await click("Pause");
  const field = page.locator(".velocity");
  const paused = await renderedGeometry(field);
  for (const unsupported of ["-1", "1e-322", "100"]) {
    await rate.fill(unsupported);
    await click("Apply");
    await expect(page.getByRole("alert")).toContainText("rate");
    await expect.poll(() => renderedGeometry(field)).toBe(paused ?? "");
  }
  await click("Restart");
  await expect(page.locator("#outflow")).toHaveText("0");
  await click("Run");
  await expect(page.locator("#outflow")).toHaveText("0.09375");
  await click("Restore defaults");
  await expect(rate).toHaveValue("0.1875");
  await expect.poll(() => renderedGeometry(field)).toBe("");
});

test("higher flow at fixed width lengthens the inlet arrow on the same scale", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const lengths: number[] = [];
  for (const flux of ["0.09375", "0.1875"]) {
    await page.getByLabel("Inlet rate").fill(flux);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.clock.runFor(500);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const shaft = arrowAt(
      (await renderedGeometry(page.locator(".velocity"))) ?? "",
      12.5,
      337.5,
    );
    lengths.push(shaft[2] - shaft[0]);
  }
  expect(lengths[0]).toBeGreaterThan(0);
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
});

test("moving then narrowing the inlet strengthens the rendered downward jet", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const inlet = page.getByRole("group", { name: "Inlet", exact: true });
  await page.getByLabel("Inlet rate").fill("0.09375");
  await inlet.getByLabel("Wall").selectOption("top");
  await inlet.getByLabel("Position").fill("0.25");
  const lengths: number[] = [];
  for (const width of ["0.1875", "0.09375"]) {
    await inlet.getByLabel("Width").fill(width);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.locator("#ports path").first()).toHaveAttribute(
      "d",
      /^M100 0 h/,
    );
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.clock.runFor(350);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const path = await renderedGeometry(page.locator(".velocity"));
    const shaft = arrowAt(path ?? "", 112.5, 12.5);
    lengths.push(shaft[3] - shaft[1]);
  }
  expect(lengths[0]).toBeGreaterThan(0);
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
});

test("moving then narrowing the outlet redirects the field and increases exit speed", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const outlet = page.getByRole("group", { name: "Outlet", exact: true });
  const inletMarker = page.locator("#ports path").first();
  const outletMarker = page.locator("#ports path").last();
  const defaultInlet = await inletMarker.getAttribute("d");
  const defaultOutlet = await outletMarker.getAttribute("d");
  async function runField() {
    await click("Run");
    await page.clock.runFor(1000);
    await click("Pause");
    await expect(page.locator("#outflow")).toHaveText("0.1875");
    return (await renderedGeometry(page.locator(".velocity"))) ?? "";
  }
  const original = await runField();
  await outlet.getByLabel("Wall").selectOption("top");
  await outlet.getByLabel("Position").fill("0.5");
  const exitSpeeds: number[] = [];
  for (const width of ["0.1875", "0.09375"]) {
    await outlet.getByLabel("Width").fill(width);
    await click("Apply");
    await expect(page.locator("#time")).toHaveText("0.00 s");
    await expect(outletMarker).toHaveAttribute("d", /^M200 0 h/);
    await expect(inletMarker).toHaveAttribute("d", defaultInlet ?? "");
    const path = await runField();
    expect(path).not.toBe(original);
    const shaft = arrowAt(path, 212.5, 12.5);
    exitSpeeds.push(shaft[1] - shaft[3]);
  }
  expect(exitSpeeds[0]).toBeGreaterThan(0);
  expect(exitSpeeds[1]).toBeGreaterThan(exitSpeeds[0]);
  const active = await renderedGeometry(page.locator(".velocity"));
  for (const [wall, pos, message] of [
    ["top", "1.5", "fit"],
    ["left", "0.125", "overlap"],
    ["top", "0.123", "multiples"],
  ]) {
    await outlet.getByLabel("Wall").selectOption(wall);
    await outlet.getByLabel("Position").fill(pos);
    await click("Apply");
    await expect(page.getByRole("alert")).toContainText(message);
    await expect
      .poll(() => renderedGeometry(page.locator(".velocity")))
      .toBe(active ?? "");
  }
  await click("Restart");
  await expect(outletMarker).toHaveAttribute("d", "M200 0 h37.5");
  await runField();
  await click("Restore defaults");
  await expect(outletMarker).toHaveAttribute("d", defaultOutlet ?? "");
  await expect(outlet.getByLabel("Wall")).toHaveValue("right");
  await expect(outlet.getByLabel("Width")).toHaveValue("0.1875");
});

function arrowAt(path: string, sampleX: number, sampleY: number) {
  const segments = Array.from(
    path.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g),
    (m) => m.slice(1).map(Number),
  );
  const shaft = segments.find(
    ([x, y, tx, ty]) =>
      Math.abs((x + tx) / 2 - sampleX) < 0.02 &&
      Math.abs((y + ty) / 2 - sampleY) < 0.02,
  );
  expect(shaft).toBeDefined();
  if (!shaft) throw Error("Missing arrow at sample point");
  return shaft;
}

test("resize the cavity, correct an opening, restart and restore defaults", async ({
  page,
}) => {
  await page.goto("/");
  const group = page.getByRole("group", { name: "Cavity", exact: true });
  const w = group.getByLabel("Width"),
    h = group.getByLabel("Height");
  const outlet = page
    .getByRole("group", { name: "Outlet", exact: true })
    .getByLabel("Position");
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  const walls = page.locator("#walls"),
    marker = page.locator("#ports path").last();
  const field = page.locator(".velocity");
  const bounds = await walls.boundingBox();
  if (!bounds) throw Error("Missing cavity");
  for (const [width, height, exit, x, y] of [
    ["1.5", "1.25", "M600 200 v-75", 312.5, 12.5],
    ["1.5", "1.03125", "M600 112.5 v-75", 12.5, 400],
    ["1.75", "1", "M700 100 v-75", 662.5, 112.5],
  ] as const) {
    await w.fill(width);
    await h.fill(height);
    await click("Apply");
    await expect.poll(() => renderedGeometry(field)).toBe("");
    await expect(marker).toHaveAttribute("d", exit);
    const box = await walls.boundingBox();
    if (!box) throw Error("Missing resized cavity");
    // Browser bounds include the wall stroke. Allow one display pixel.
    expect(
      Math.abs(box.width - (bounds.width * Number(width)) / 1.5),
    ).toBeLessThan(1);
    expect(Math.abs(box.height - bounds.height * Number(height))).toBeLessThan(
      1,
    );
    await click("Run");
    await expect.poll(() => renderedGeometry(field)).toMatch(/L/);
    await click("Pause");
    arrowAt((await renderedGeometry(field)) ?? "", x, y);
  }
  await click("Restore defaults");
  await click("Run");
  await expect.poll(() => renderedGeometry(field)).toMatch(/L/);
  await click("Pause");
  const paused = (await renderedGeometry(field)) ?? "";
  for (const value of ["", "0", "-1", "0.51", "2.03125"]) {
    await w.fill(value);
    await click("Apply");
    await expect(page.getByRole("alert")).toContainText("between 0.5 and 2");
    await expect.poll(() => renderedGeometry(field)).toBe(paused);
  }
  await w.fill("1.5");
  await h.fill("0.875");
  await click("Apply");
  await expect(page.getByRole("alert")).toContainText("Outlet");
  await expect.poll(() => renderedGeometry(field)).toBe(paused);
  await outlet.fill("0.625");
  await click("Apply");
  await expect(page.getByRole("alert")).toBeEmpty();
  await expect.poll(() => renderedGeometry(field)).toBe("");
  await expect(walls).toHaveAttribute("height", "350");
  await expect(marker).toHaveAttribute("d", "M600 100 v-75");
  await click("Run");
  await expect(page.locator("#outflow")).toHaveText("0.1875");
  await h.fill("2");
  await click("Restart");
  await expect(walls).toHaveAttribute("height", "350");
  await expect.poll(() => renderedGeometry(field)).toBe("");
  await expect(marker).toHaveAttribute("d", "M600 100 v-75");
  await click("Restore defaults");
  await expect(w).toHaveValue("1.5");
  await expect(h).toHaveValue("1");
  await expect(outlet).toHaveValue("0.75");
  await expect(walls).toHaveAttribute("height", "400");
});

test("compare the shallow and tall currents at the same place and time", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const height = page
    .getByRole("group", { name: "Cavity", exact: true })
    .getByLabel("Height");
  await page
    .getByRole("group", { name: "Outlet", exact: true })
    .getByLabel("Position")
    .fill("0.625");
  for (const [depth, y, minSlope, maxSlope] of [
    ["0.875", 12.5, 0, 0.15],
    ["1.25", 162.5, 0.35, 0.7],
  ] as const) {
    await height.fill(depth);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.clock.runFor(1000);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const [x0, y0, x1, y1] = arrowAt(
      (await renderedGeometry(page.locator(".velocity"))) ?? "",
      312.5,
      y,
    );
    expect(x1).toBeGreaterThan(x0);
    const slope = (y0 - y1) / (x1 - x0);
    expect(slope).toBeGreaterThan(minSlope);
    expect(slope).toBeLessThan(maxSlope);
  }
});

test("large desktop keeps the enlarged default cavity and pressure key in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/");
  const walls = await page.locator("#walls").boundingBox();
  expect(walls?.width).toBeGreaterThan(1200);
  await expect(page.locator("#pressure-scale")).toBeInViewport({ ratio: 1 });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".velocity path")
        .evaluateAll(
          (paths) =>
            new Set(
              paths
                .filter((path) => path.getAttribute("d"))
                .map((path) => path.getAttribute("stroke")),
            ).size,
        ),
    )
    .toBeGreaterThan(1);
});
