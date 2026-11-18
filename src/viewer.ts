import { Cavity, scene } from "./solver.ts";
function element<T extends Element>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) throw Error(`Missing ${selector}`);
  return result;
}
const field = element<SVGPathElement>(".velocity");
const status = element("#status");
const time = element("#time");
const run = element<HTMLButtonElement>("#run");
const restart = element<HTMLButtonElement>("#restart");
let model = new Cavity();
const width = element<SVGRectElement>("#walls").width.baseVal.value;
const pattern = element<SVGPatternElement>("#dots");
const spacing = pattern.width.baseVal.value;
const scale = width / scene.width;
const height = scene.height * scale;
const axes = element("#axes");
for (let x = 0; x <= scene.width; x += 0.25) {
  axes.insertAdjacentHTML(
    "beforeend",
    `<text x="${x * scale}" y="${height + 22}" text-anchor="middle">${x.toFixed(2)} m</text>`,
  );
}
for (let y = 0; y <= scene.height; y += 0.25) {
  axes.insertAdjacentHTML(
    "beforeend",
    `<text x="-8" y="${height - y * scale + 4}" text-anchor="end">${y.toFixed(2)}</text>`,
  );
}
for (const [x, bottom, color] of [
  [0, scene.inletBottom, "#67d8b4"],
  [width, scene.outletBottom, "#ffb26d"],
] as const) {
  const y = height - bottom * scale;
  element("#ports").insertAdjacentHTML(
    "beforeend",
    `<path d="M${x} ${y} v-${scene.openingWidth * scale}" stroke="${color}" stroke-width="6"/>`,
  );
}
const conditions = [
  ["Cavity", `${scene.width} × ${scene.height} m`],
  ["Opening width", `${scene.openingWidth} m`],
  ["Inlet flow", `${scene.flux} m²/s`],
  ["Viscosity", `${scene.viscosity} m²/s`],
];
element("#conditions").innerHTML = conditions
  .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
  .join("");
function draw() {
  const lines: string[] = [];
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const [u, v] = model.velocity(x / scale, (height - y) / scale);
      const speed = Math.hypot(u, v);
      if (speed === 0) continue;
      // Compress the speed range so slow return flow has a readable arrowhead.
      const length = (22 * Math.asinh(8 * speed)) / Math.asinh(8);
      const dx = (u / speed) * length,
        dy = (-v / speed) * length;
      const tipX = x + dx / 2,
        tipY = y + dy / 2;
      const head = Math.min(0.42, 4.8 / length);
      const point = (a: number, b: number) => `${a.toFixed(2)} ${b.toFixed(2)}`;
      lines.push(
        "M" +
          point(x - dx / 2, y - dy / 2) +
          "L" +
          point(tipX, tipY) +
          "l" +
          point((-dx + dy * 0.55) * head, (-dy - dx * 0.55) * head) +
          "M" +
          point(tipX, tipY) +
          "l" +
          point((-dx - dy * 0.55) * head, (-dy + dx * 0.55) * head),
      );
    }
  }
  field.setAttribute("d", lines.join(""));
  time.textContent = `${model.time.toFixed(2)} s`;
}
let scheduled: number | undefined;
let previous = 0;
let remainder = 0;
function frame(now: number) {
  if (previous) remainder += Math.min((now - previous) / 1000, 0.1);
  previous = now;
  while (remainder >= scene.dt) {
    model.step();
    remainder -= scene.dt;
  }
  draw();
  scheduled = requestAnimationFrame(frame);
}
run.addEventListener("click", () => {
  if (scheduled !== undefined) {
    cancelAnimationFrame(scheduled);
    scheduled = undefined;
    run.textContent = "Resume";
    status.textContent = "Paused";
    return;
  }
  previous = performance.now();
  run.textContent = "Pause";
  restart.disabled = false;
  status.textContent = "Running";
  scheduled = requestAnimationFrame(frame);
});
restart.addEventListener("click", () => {
  if (scheduled !== undefined) cancelAnimationFrame(scheduled);
  scheduled = undefined;
  remainder = 0;
  model = new Cavity();
  run.textContent = "Run";
  restart.disabled = true;
  status.textContent = "At rest";
  draw();
});
