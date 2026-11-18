import type { Locator } from "@playwright/test";
export function geometry(field: Locator) {
  return field
    .locator("path")
    .evaluateAll((paths) =>
      paths.map((path) => path.getAttribute("d") ?? "").join(""),
    );
}
