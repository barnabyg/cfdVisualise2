import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { Cavity, scene, type Wall } from "../src/solver.ts";

function sampleWall(cavity: Cavity, wall: Wall, position: number) {
  switch (wall) {
    case "left": {
      const [u, v] = cavity.velocity(0, position);
      return { outward: -u, tangent: v };
    }
    case "right": {
      const [u, v] = cavity.velocity(cavity.settings.width, position);
      return { outward: u, tangent: v };
    }
    case "bottom": {
      const [u, v] = cavity.velocity(position, 0);
      return { outward: -v, tangent: u };
    }
    case "top": {
      const [u, v] = cavity.velocity(position, cavity.settings.height);
      return { outward: v, tangent: u };
    }
  }
}

for (const [flux, width, height] of [
  [scene.flux, 1.5, 1],
  [scene.flux / 2, 1.5, 1],
  [2 ** -1022, 1.5, 1],
  [scene.flux, 1.75, 1.25],
])
  test(`boundary flux at rate ${flux} in ${width} x ${height} m`, () => {
    const cavity = new Cavity({ flux, width, height });
    // Midpoint quadrature over the entire walls, including their solid portions.
    const samples = height * 960;
    const dy = height / samples;
    for (const instant of [0.1, 1, 6]) {
      while (cavity.time < instant) cavity.step();
      if (height > scene.height)
        assert.ok(
          Math.hypot(...cavity.velocity(0.75, 1.125)) > 0,
          "flow in the added space",
        );
      let inlet = 0;
      let outlet = 0;
      for (let row = 0; row < samples; row++) {
        const y = (row + 0.5) * dy;
        const left = cavity.velocity(0, y)[0];
        const right = cavity.velocity(width, y)[0];
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
        if (position >= 0.25 && position < 0.25 + width) {
          const { outward, tangent } = sampleWall(cavity, wall, position);
          assert.equal(tangent, 0);
          integrated -= (outward * length) / 960;
        }
      }
      assert.ok(Math.abs(integrated - flux) / flux < 0.001);
      if (wall !== "left") assert.equal(cavity.velocity(0, 0.125)[0], 0);
    }
  });
}

for (const [wall, cavityWidth, height] of [
  ["top", 1.5, 1],
  ["bottom", 1.5, 1],
  ["left", 1.5, 1],
  ["right", 1.5, 1],
  ["top", 1.75, 1.25],
] as const) {
  test(`relocated ${wall} outlet in ${cavityWidth} x ${height} m discharges across its active faces only`, () => {
    for (const width of [0.1875, 0.09375]) {
      const start = 0.5;
      const cavity = new Cavity({
        width: cavityWidth,
        height,
        outlet: { wall, start, width },
      });
      for (const instant of [0.1, 1, 6]) {
        while (cavity.time < instant) cavity.step();
        let inflow = 0,
          outflow = 0;
        for (const side of ["left", "right", "bottom", "top"] as const) {
          const upright = side === "left" || side === "right";
          const ds = 1 / 960;
          const length = upright ? height : cavityWidth;
          for (let i = 0; i < length / ds; i++) {
            const pos = (i + 0.5) * ds;
            const { outward } = sampleWall(cavity, side, pos);
            if (side === wall && pos >= start && pos < start + width)
              outflow += outward * ds;
            else if (side === "left" && pos >= 0.0625 && pos < 0.25)
              inflow += outward * ds;
            else assert.ok(outward === 0, "impermeable remainder");
          }
        }
        assert.ok(inflow < 0 && outflow > 0);
        assert.ok(Math.abs(inflow + scene.flux) / scene.flux < 0.001);
        assert.ok(Math.abs(outflow + inflow) / -inflow < 0.001);
        assert.ok(
          Math.abs(outflow / width - (width === 0.1875 ? 1 : 2)) < 0.002,
        );
      }
    }
  });
}
