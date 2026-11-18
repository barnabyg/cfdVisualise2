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
