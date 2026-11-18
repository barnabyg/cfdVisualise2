import { Cavity, type Opening, type Wall, scene, vertical } from "./solver.ts";
function element<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const result = root.querySelector<T>(selector);
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
function showConditions() {
  element("#ports").replaceChildren();
  for (const [port, color] of [
    [model.settings.inlet, "#67d8b4"],
    [model.settings.outlet, "#ffb26d"],
  ] as const) {
    const upright = vertical(port.wall);
    const x = upright ? (port.wall === "left" ? 0 : width) : port.start * scale;
    const y = upright
      ? height - port.start * scale
      : port.wall === "bottom"
        ? height
        : 0;
    const direction = upright ? "v-" : "h";
    element("#ports").insertAdjacentHTML(
      "beforeend",
      `<path d="M${x} ${y} ${direction}${port.width * scale}" stroke="${color}" stroke-width="6"/>`,
    );
  }
  const conditions = [
    ["Cavity", `${scene.width} × ${scene.height} m`],
    ["Inlet width", `${model.settings.inlet.width} m`],
    ["Outlet width", `${model.settings.outlet.width} m`],
    ["Inlet flow", `${model.settings.flux} m²/s`],
    ["Calculated outflow", '<span id="outflow"></span> m²/s'],
    ["Viscosity", `${scene.viscosity} m²/s`],
  ];
  element("#conditions").innerHTML = conditions
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}
showConditions();
const rate = element<HTMLInputElement>("#rate");
function openingEditor(name: string, initial: Opening) {
  const group = document.createElement("fieldset");
  group.innerHTML = `<legend>${name}</legend>
    <label>Wall <select><option value="left">Left</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="top">Top</option></select></label>
    <label>Position (m) <input type="number" step="${scene.gridSpacing}"></label>
    <label>Width (m) <input type="number" step="${scene.gridSpacing}"></label>`;
  element("#geometry").append(group);
  const select = element<HTMLSelectElement>("select", group);
  const [start, width] = group.querySelectorAll("input");
  function set(port: Opening) {
    select.value = port.wall;
    start.value = String(port.start);
    width.value = String(port.width);
  }
  set(initial);
  return {
    set,
    read: (): Opening => ({
      wall: select.value as Wall,
      start: start.valueAsNumber,
      width: width.valueAsNumber,
    }),
  };
}
element("#grid-spacing").textContent = String(scene.gridSpacing);
const inletEditor = openingEditor("Inlet", model.settings.inlet);
const outletEditor = openingEditor("Outlet", model.settings.outlet);
rate.value = String(model.settings.flux);
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
  element("#outflow").textContent = Number(
    model.outflow.toPrecision(5),
  ).toString();
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
function reset(next: Cavity) {
  if (scheduled !== undefined) cancelAnimationFrame(scheduled);
  scheduled = undefined;
  remainder = 0;
  model = next;
  showConditions();
  run.textContent = "Run";
  restart.disabled = true;
  status.textContent = "At rest";
  draw();
}

restart.addEventListener("click", () => reset(new Cavity(model.settings)));
element("#settings").addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    reset(
      new Cavity({
        flux: rate.valueAsNumber,
        inlet: inletEditor.read(),
        outlet: outletEditor.read(),
      }),
    );
    element("#feedback").textContent = "";
  } catch (error) {
    element("#feedback").textContent = String(
      error instanceof Error ? error.message : error,
    );
  }
});
element("#defaults").addEventListener("click", () => {
  reset(new Cavity());
  outletEditor.set(model.settings.outlet);
  inletEditor.set(model.settings.inlet);
  rate.value = String(model.settings.flux);
  element("#feedback").textContent = "";
});
draw();
