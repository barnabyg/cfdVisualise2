import assert from "node:assert/strict";
import test from "node:test";
import { Cavity, scene } from "../src/solver.ts";

test("the computed boundary field admits and discharges the prescribed flux", () => {
  const cavity = new Cavity();
  // Midpoint quadrature over the entire walls, including their solid portions.
  const samples = 960;
  const dy = scene.height / samples;
  for (const instant of [0.1, 1, 6]) {
    while (cavity.time < instant) cavity.step();
    let inlet = 0;
    let outlet = 0;
    for (let row = 0; row < samples; row++) {
      const y = (row + 0.5) * dy;
      inlet -= cavity.velocity(0, y)[0] * dy;
      outlet += cavity.velocity(scene.width, y)[0] * dy;
    }
    assert.ok(inlet < 0 && outlet > 0, "outward normal flux signs");
    assert.ok(Math.abs(inlet + scene.flux) / scene.flux < 0.001);
    assert.ok(Math.abs(outlet + inlet) / -inlet < 0.001);
  }
});
