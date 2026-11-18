import { test, expect } from "@playwright/test";
test("Run develops directional arrows from still fluid", async ({ page }) => {
  await page.goto("/");
  const field = page.getByRole("img", { name: "Cavity velocity field" });
  await expect(field).toBeVisible();
  const arrows = field.locator("path.velocity");
  await expect(arrows).toHaveAttribute("d", "");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(arrows).toHaveAttribute("d", /L/);
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
  const paused = await field.getAttribute("d");
  await rate.fill("-1");
  await click("Apply");
  await expect(page.getByRole("alert")).toContainText("positive");
  await expect(field).toHaveAttribute("d", paused ?? "");
  await click("Restart");
  await expect(page.locator("#outflow")).toHaveText("0");
  await click("Run");
  await expect(page.locator("#outflow")).toHaveText("0.09375");
  await click("Restore defaults");
  await expect(rate).toHaveValue("0.1875");
  await expect(field).toHaveAttribute("d", "");
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
    const path = await page.locator(".velocity").getAttribute("d");
    const segments = Array.from(
      (path ?? "").matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g),
      (m) => m.slice(1).map(Number),
    );
    const shaft = segments.find(
      ([x, y, tx, ty]) =>
        Math.abs((x + tx) / 2 - 112.5) < 0.02 &&
        Math.abs((y + ty) / 2 - 12.5) < 0.02,
    );
    expect(shaft).toBeDefined();
    if (!shaft) throw Error("Missing arrow beside inlet");
    lengths.push(shaft[3] - shaft[1]);
  }
  expect(lengths[0]).toBeGreaterThan(0);
  expect(lengths[1]).toBeGreaterThan(lengths[0]);
});
