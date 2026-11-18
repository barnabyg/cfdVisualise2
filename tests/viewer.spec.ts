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
