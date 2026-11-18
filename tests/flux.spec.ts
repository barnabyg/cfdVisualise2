import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { Cavity, scene } from "../src/solver.ts";

for (const flux of [scene.flux, scene.flux / 2])
  test(`boundary flux at rate ${flux}`, () => {
    const cavity = new Cavity({ flux });
    // Midpoint quadrature over the entire walls, including their solid portions.
    const samples = 960;
    const dy = scene.height / samples;
    for (const instant of [0.1, 1, 6]) {
      while (cavity.time < instant) cavity.step();
      let inlet = 0;
      let outlet = 0;
      for (let row = 0; row < samples; row++) {
        const y = (row + 0.5) * dy;
        const left = cavity.velocity(0, y)[0];
        const right = cavity.velocity(scene.width, y)[0];
        if (y > scene.inletBottom && y < scene.inletBottom + scene.openingWidth)
          inlet -= left * dy;
        else assert.equal(left, 0, "impermeable left wall");
        if (
          y > scene.outletBottom &&
          y < scene.outletBottom + scene.openingWidth
        )
          outlet += right * dy;
        else assert.equal(right, 0, "impermeable right wall");
      }
      assert.ok(inlet < 0 && outlet > 0, "outward normal flux signs");
      assert.ok(Math.abs(inlet + flux) / flux < 0.001);
      assert.ok(Math.abs(outlet + inlet) / -inlet < 0.001);
    }
  });

for (const wall of ["left", "right", "bottom", "top"] as const) {
  test(`prescribed normal jet on the ${wall} wall`, () => {
    const flux = 0.09375;
    for (const width of [0.1875, 0.09375]) {
      const cavity = new Cavity({ flux, inlet: { wall, start: 0.25, width } });
      for (let s = 0; s < 80; s++) cavity.step();
      let integrated = 0;
      const vertical = wall === "left" || wall === "right";
      const length = vertical ? scene.height : scene.width;
      for (let i = 0; i < 960; i++) {
        const position = ((i + 0.5) * length) / 960;
        const [u, v] = vertical
          ? cavity.velocity(wall === "left" ? 0 : scene.width, position)
          : cavity.velocity(position, wall === "bottom" ? 0 : scene.height);
        if (position >= 0.25 && position < 0.25 + width) {
          assert.equal(vertical ? v : u, 0);
          integrated +=
            ((wall === "left"
              ? u
              : wall === "right"
                ? -u
                : wall === "bottom"
                  ? v
                  : -v) *
              length) /
            960;
        }
      }
      assert.ok(Math.abs(integrated - flux) / flux < 0.001);
      if (wall !== "left") assert.equal(cavity.velocity(0, 0.125)[0], 0);
    }
  });
}
