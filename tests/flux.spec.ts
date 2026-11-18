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
