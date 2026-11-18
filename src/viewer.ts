import { Cavity, type Opening, type Wall, scene, vertical } from "./solver.ts";
function element<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const result = root.querySelector<T>(selector);
  if (!result) throw Error(`Missing ${selector}`);
  return result;
}
const field = element<SVGGElement>(".velocity");
const colours = [
  "#748fdc",
  "#86b7ea",
  "#a6d9e9",
  "#d7e6db",
  "#f6ddb0",
  "#ffbf82",
  "#fa966d",
  "#f07569",
  "#e35960",
];
const pressureStops = [0, 0.25, 0.5, 0.65, 0.75, 0.8, 0.85, 0.9, 1];
const arrows: SVGPathElement[] = [];
let pressureRange = 1;
const status = element("#status");
const time = element("#time");
const run = element<HTMLButtonElement>("#run");
const restart = element<HTMLButtonElement>("#restart");
let model = new Cavity();
const walls = element<SVGRectElement>("#walls");
const pattern = element<SVGPatternElement>("#dots");
const density = element<HTMLSelectElement>("#density");
const defaultDensity = density.value;
// Keep metres and arrow lengths on one display scale across comparisons.
const scale = 400;
function rebuildGrid() {
  const width = model.settings.width * scale,
    height = model.settings.height * scale;
  const spacing = Number(density.value);
  pattern.setAttribute("width", String(spacing));
  pattern.setAttribute("height", String(spacing));
  pattern.setAttribute("y", String(height % spacing));
  const dot = element("circle", pattern);
  dot.setAttribute("cx", String(spacing / 2));
  dot.setAttribute("cy", String(spacing / 2));
  arrows.length = 0;
  field.replaceChildren();
  for (let y = height - spacing / 2; y > 0; y -= spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const arrow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      field.append(arrow);
      arrows.push(arrow);
    }
  }
}
function showConditions() {
  const { width: metresWide, height: metresHigh } = model.settings;
  const width = metresWide * scale,
    height = metresHigh * scale;
  walls.setAttribute("width", String(width));
  walls.setAttribute("height", String(height));
  const plotWidth = scene.maxDimension * scale;
  const leftMargin = 52,
    rightMargin = 40;
  const originX = -leftMargin - (plotWidth - width) / 2;
  element("#field").setAttribute(
    "viewBox",
    `${originX} -20 ${plotWidth + leftMargin + rightMargin} ${height + 57}`,
  );
  // Trace the perimeter of the resolved rows, covering arrow tips at the wall.
  const spans = model.obstacleSpans;
  const cell = scene.gridSpacing * scale;
  const perimeter: string[] = [];
  for (const { row, start } of spans)
    perimeter.push(`L${start * cell} ${height - row * cell}v${-cell}`);
  for (const { row, end } of spans.slice().reverse())
    perimeter.push(`L${end * cell} ${height - (row + 1) * cell}v${cell}`);
  element("#obstacle").setAttribute(
    "d",
    perimeter.length ? `${perimeter.join("").replace(/^L/, "M")}Z` : "",
  );
  rebuildGrid();
  pressureRange = (model.settings.flux / model.settings.outlet.width) ** 2;
  element("#pressure-scale").innerHTML = pressureStops
    .map((stop, index) => {
      return `<span style="border-color:${colours[index]}">${Number((stop * pressureRange).toPrecision(3))}</span>`;
    })
    .join("");
  const axes = element("#axes");
  axes.replaceChildren();
  for (let x = 0; x <= metresWide; x += 0.25) {
    axes.insertAdjacentHTML(
      "beforeend",
      `<text x="${x * scale}" y="${height + 22}" text-anchor="middle">${x.toFixed(2)} m</text>`,
    );
  }
  for (let y = 0; y <= metresHigh; y += 0.25) {
    axes.insertAdjacentHTML(
      "beforeend",
      `<text x="-8" y="${height - y * scale + 4}" text-anchor="end">${y.toFixed(2)}</text>`,
    );
  }
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
    ["Cavity", `${metresWide} × ${metresHigh} m`],
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
const widthInput = element<HTMLInputElement>("#cavity-width");
const heightInput = element<HTMLInputElement>("#cavity-height");
function setDimensions() {
  for (const [input, value] of [
    [widthInput, model.settings.width],
    [heightInput, model.settings.height],
  ] as const) {
    input.step = String(scene.gridSpacing);
    input.value = String(value);
  }
}
setDimensions();
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
const shape = element<HTMLSelectElement>("#shape");
const centreX = element<HTMLInputElement>("#centre-x");
const centreY = element<HTMLInputElement>("#centre-y");
const size = element<HTMLInputElement>("#size");
function showObstacleEditor() {
  element("#size-label").textContent =
    shape.value === "circle" ? "Diameter (m)" : "Side length (m)";
  element<HTMLElement>("#obstacle-settings").hidden = shape.value === "none";
}
shape.addEventListener("change", showObstacleEditor);
function draw() {
  const spacing = Number(density.value);
  const width = model.settings.width * scale,
    height = model.settings.height * scale;
  let index = 0;
  for (let y = height - spacing / 2; y > 0; y -= spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const [u, v] = model.velocity(x / scale, (height - y) / scale);
      const speed = Math.hypot(u, v);
      const arrow = arrows[index++];
      if (speed === 0) {
        arrow.setAttribute("d", "");
        continue;
      }
      const p = model.pressureAt(x / scale, (height - y) / scale);
      const relative = pressureRange ? p / pressureRange : 0;
      let level = 0;
      while (
        level + 1 < pressureStops.length &&
        relative >= (pressureStops[level] + pressureStops[level + 1]) / 2
      )
        level++;
      arrow.setAttribute("stroke", colours[level]);
      // Compress the speed range so slow return flow has a readable arrowhead.
      const length = (22 * Math.asinh(8 * speed)) / Math.asinh(8);
      const dx = (u / speed) * length,
        dy = (-v / speed) * length;
      const tipX = x + dx / 2,
        tipY = y + dy / 2;
      const head = Math.min(0.42, 4.8 / length);
      const point = (a: number, b: number) => `${a.toFixed(2)} ${b.toFixed(2)}`;
      arrow.setAttribute(
        "d",
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
  element("#outflow").textContent = Number(
    model.outflow.toPrecision(5),
  ).toString();
  time.textContent = `${model.time.toFixed(2)} s`;
}
let scheduled: number | undefined;
density.addEventListener("change", () => {
  rebuildGrid();
  draw();
});
let previous = 0;
let remainder = 0;
function frame(now: number) {
  if (previous) remainder += Math.min((now - previous) / 1000, 0.1);
  previous = now;
  while (remainder >= scene.dt) {
    model.step();
    remainder -= scene.dt;
    if (model.converged) {
      scheduled = undefined;
      run.textContent = "Run";
      run.disabled = true;
      status.textContent = "Converged";
      draw();
      return;
    }
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
  run.disabled = false;
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
        width: widthInput.valueAsNumber,
        height: heightInput.valueAsNumber,
        flux: rate.valueAsNumber,
        obstacle:
          shape.value === "none"
            ? undefined
            : {
                shape: shape.value === "circle" ? "circle" : "square",
                x: centreX.valueAsNumber,
                y: centreY.valueAsNumber,
                size: size.valueAsNumber,
              },
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
  density.value = defaultDensity;
  reset(new Cavity());
  shape.value = "none";
  for (const input of [centreX, centreY, size])
    input.value = input.defaultValue;
  showObstacleEditor();
  setDimensions();
  outletEditor.set(model.settings.outlet);
  inletEditor.set(model.settings.inlet);
  rate.value = String(model.settings.flux);
  element("#feedback").textContent = "";
});
draw();
