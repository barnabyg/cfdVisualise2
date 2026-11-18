import { geometry as renderedGeometry } from "./geometry.ts";
import { test, expect, type Page } from "@playwright/test";
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
  await expect(density).toHaveValue("12.5");
  await expect(arrows).toHaveCount(1536);
  await expect(page.locator("#dots")).toHaveAttribute("width", "12.5");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.locator("#outflow")).toHaveText("0.1875");
  await page.getByRole("button", { name: "Pause" }).click();
  const time = (await page.locator("#time").textContent()) ?? "";
  for (const [label, count, spacing] of [
    ["Sparse", 96, "50"],
    ["Dense", 1536, "12.5"],
    ["Standard", 384, "25"],
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
  await expect(density).toHaveValue("12.5");
  await expect(arrows).toHaveCount(1536);
  await expect(page.locator("#dots")).toHaveAttribute("width", "12.5");
});

test("collapse the flow readouts while keeping settings available", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const summary = page
    .locator("summary")
    .filter({ hasText: "Flow conditions" });
  const rate = page.getByLabel("Inlet rate");
  const readouts = page.locator("#conditions");
  await expect(summary).toBeVisible();
  await expect(readouts).toBeHidden();
  await expect(rate).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Restore defaults" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await summary.click();
  await expect(readouts).toBeVisible();
  await expect(readouts.locator("dt")).toHaveText([
    "Cavity",
    "Inlet width",
    "Outlet width",
    "Inlet flow",
    "Calculated outflow",
    "Viscosity",
  ]);
  await expect(rate).toBeVisible();
  await page.clock.runFor(200);
  const time = page.locator("#time");
  const beforeCollapse = Number.parseFloat((await time.textContent()) ?? "");
  await summary.press("Enter");
  await expect(readouts).toBeHidden();
  await expect(rate).toBeVisible();
  await page.clock.runFor(200);
  expect(Number.parseFloat((await time.textContent()) ?? "")).toBeGreaterThan(
    beforeCollapse,
  );
  await summary.press("Space");
  await expect(readouts).toBeVisible();
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
  await selectStandardGrid(page);
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
  await selectStandardGrid(page);
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
  await selectStandardGrid(page);
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

test("preview snapped moves and endpoint resizes for both openings before Apply", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await selectStandardGrid(page);
  const click = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();
  await click("Run");
  await page.clock.runFor(400);
  await click("Pause");
  const time = page.locator("#time");
  const arrows = page.locator(".velocity");
  const pausedTime = (await time.textContent()) ?? "";
  const pausedGeometry = (await renderedGeometry(arrows)) ?? "";
  expect(pausedGeometry).toMatch(/L/);

  const inlet = page.getByRole("group", { name: "Inlet", exact: true });
  const outlet = page.getByRole("group", { name: "Outlet", exact: true });
  const inletPreview = page.locator("#edit-inlet");
  const outletPreview = page.locator("#edit-outlet");
  const applied = page.locator("#ports path");
  async function drag(grip: string, cells: number, upright: boolean) {
    const opening = upright ? inletPreview : outletPreview;
    const target = opening.locator(`[data-grip="${grip}"]`);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw Error("Missing opening drag target");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const pixelsPerCell = await target.evaluate((element: SVGRectElement) => {
      const matrix = element.getScreenCTM();
      if (!matrix) throw Error("Missing opening transform");
      return Math.hypot(matrix.a, matrix.b) * 12.5;
    });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(
      x + (upright ? 0 : cells * pixelsPerCell),
      y - (upright ? cells * pixelsPerCell : 0),
      { steps: 3 },
    );
    await page.mouse.up();
  }
  await drag("move", 2.25, true);
  await expect(inlet.getByLabel("Position")).toHaveValue("0.125");
  await expect(inlet.getByLabel("Width")).toHaveValue("0.1875");
  await drag("start", 1, true);
  await expect(inlet.getByLabel("Position")).toHaveValue("0.15625");
  await expect(inlet.getByLabel("Width")).toHaveValue("0.15625");
  await drag("end", 2, true);
  await expect(inlet.getByLabel("Position")).toHaveValue("0.15625");
  await expect(inlet.getByLabel("Width")).toHaveValue("0.21875");
  await expect(inletPreview.locator("line")).toHaveCSS("display", "inline");
  await expect(inletPreview.locator("line")).toHaveAttribute("x2", "87.5");

  await outlet.getByLabel("Wall").selectOption("top");
  await outlet.getByLabel("Position").fill("0.51");
  await expect(outletPreview).toHaveAttribute(
    "transform",
    "translate(200 0) rotate(0)",
  );
  await outlet.getByLabel("Position").press("Tab");
  await expect(outlet.getByLabel("Position")).toHaveValue("0.5");
  await drag("move", 4, false);
  await expect(outlet.getByLabel("Position")).toHaveValue("0.625");
  await expect(outlet.getByLabel("Width")).toHaveValue("0.1875");
  await drag("start", 1, false);
  await expect(outlet.getByLabel("Position")).toHaveValue("0.65625");
  await expect(outlet.getByLabel("Width")).toHaveValue("0.15625");
  await drag("end", -30, false);
  await expect(outlet.getByLabel("Position")).toHaveValue("0.65625");
  await expect(outlet.getByLabel("Width")).toHaveValue("0.03125");
  await outlet.getByLabel("Width").fill("0.1");
  await expect(outletPreview.locator("line")).toHaveAttribute("x2", "37.5");
  await expect(applied.first()).toHaveAttribute("d", "M0 375 v-75");
  await expect(applied.last()).toHaveAttribute("d", "M600 100 v-75");
  await expect(time).toHaveText(pausedTime);
  expect(await renderedGeometry(arrows)).toBe(pausedGeometry);

  await click("Apply");
  await expect(page.getByRole("alert")).toBeEmpty();
  await expect(outlet.getByLabel("Width")).toHaveValue("0.09375");
  await expect(time).toHaveText("0.00 s");
  await expect(applied.first()).toHaveAttribute("d", "M0 337.5 v-87.5");
  await expect(applied.last()).toHaveAttribute("d", "M262.5 0 h37.5");
  await expect(inletPreview.locator("line")).toBeHidden();
  await expect(outletPreview.locator("line")).toBeHidden();
  await click("Run");
  await page.clock.runFor(400);
  await expect(page.locator("#outflow")).toHaveText("0.1875");
});

async function selectStandardGrid(page: Page) {
  await page.getByLabel("Grid density").selectOption({ label: "Standard" });
}

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
  await selectStandardGrid(page);
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
  await selectStandardGrid(page);
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
});

test("pressure colours distinguish the default flow and the key follows playback", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  const key = page.locator("#pressure-scale");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "Pause" }).click();
  const largestColourShare = await page
    .locator('.velocity path[d]:not([d=""])')
    .evaluateAll((paths) => {
      const counts = new Map<string | null, number>();
      for (const path of paths) {
        const colour = path.getAttribute("stroke");
        counts.set(colour, (counts.get(colour) ?? 0) + 1);
      }
      return paths.length ? Math.max(...counts.values()) / paths.length : 1;
    });
  expect(largestColourShare).toBeLessThan(0.5);
  const pausedKey = await key.textContent();
  await page.getByLabel("Grid density").selectOption({ label: "Sparse" });
  expect(await key.textContent()).toBe(pausedKey);
  await page.getByRole("button", { name: "Resume" }).click();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "Pause" }).click();
  expect(await key.textContent()).not.toBe(pausedKey);
  await page.getByRole("button", { name: "Restart" }).click();
  await expect(key).toHaveText("0");
});
