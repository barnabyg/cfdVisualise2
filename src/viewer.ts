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
const plot = element<SVGSVGElement>("#field");
const portColours = { inlet: "#67d8b4", outlet: "#ffb26d" };
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
const lastColour = colours.length - 1;
const middleColour = lastColour / 2;
const swatches = colours.map((colour) => {
  const swatch = document.createElement("span");
  swatch.style.borderColor = colour;
  return swatch;
});
element("#pressure-scale").append(...swatches);
const arrows: SVGPathElement[] = [];
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
function openingOrigin(port: Opening, width: number, height: number) {
  const offset = port.start * scale;
  return vertical(port.wall)
    ? [port.wall === "left" ? 0 : width, height - offset]
    : [offset, port.wall === "bottom" ? height : 0];
}

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
  plot.setAttribute(
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
    [model.settings.inlet, portColours.inlet],
    [model.settings.outlet, portColours.outlet],
  ] as const) {
    const upright = vertical(port.wall);
    const [x, y] = openingOrigin(port, width, height);
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
function openingEditor(key: keyof typeof portColours, name: string) {
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
  const spacing = scene.gridSpacing;
  const snap = (value: number) => Math.round(value / spacing) * spacing;
  function read(): Opening {
    const position = start.valueAsNumber;
    const size = width.valueAsNumber;
    return {
      wall: select.value as Wall,
      start: position >= 0 ? snap(position) : position,
      width: size > 0 ? Math.max(spacing, snap(size)) : size,
    };
  }

  element("#port-editors").insertAdjacentHTML(
    "beforeend",
    `<g id="edit-${key}" color="${portColours[key]}">
      <line class="port-preview"/>
      <rect class="port-move" data-grip="move"/>
      <circle class="port-handle"/>
      <circle class="port-handle"/>
      <rect class="port-resize" data-grip="start"/>
      <rect class="port-resize" data-grip="end"/>
    </g>`,
  );
  const preview = element<SVGGElement>(`#edit-${key}`);
  const line = element("line", preview);
  const [move, startGrip, endGrip] = preview.querySelectorAll("rect");
  const [startHandle, endHandle] = preview.querySelectorAll("circle");
  const index = key === "inlet" ? 0 : 1;
  function wallLength(wall: Wall) {
    return model.settings[vertical(wall) ? "height" : "width"];
  }
  function render() {
    const port = read();
    const applied = model.settings[key];
    const upright = vertical(port.wall);
    const length = wallLength(port.wall);
    const end = port.start + port.width;
    const visible = port.start >= 0 && port.width > 0 && end <= length;
    const changed =
      port.wall !== applied.wall ||
      port.start !== applied.start ||
      port.width !== applied.width;
    element("#ports").children[index]?.classList.toggle(
      "port-pending",
      visible && changed,
    );
    preview.style.display = visible ? "" : "none";
    if (!visible) return;

    const [x, y] = openingOrigin(
      port,
      model.settings.width * scale,
      model.settings.height * scale,
    );
    preview.setAttribute(
      "transform",
      `translate(${x} ${y}) rotate(${upright ? -90 : 0})`,
    );
    preview.classList.toggle("port-vertical", upright);
    preview.classList.toggle("port-draft", changed);

    const span = port.width * scale;
    const edge = Math.min(10, span / 3);
    for (const [target, left, size] of [
      [move, edge, span - 2 * edge],
      [startGrip, -10, edge + 10],
      [endGrip, span - edge, edge + 10],
    ] as const) {
      target.setAttribute("x", String(left));
      target.setAttribute("width", String(size));
    }
    for (const handle of [startHandle, endHandle])
      handle.setAttribute("r", String(Math.min(5, span / 4)));
    endHandle.setAttribute("cx", String(span));
    line.setAttribute("x2", String(span));
  }

  function normalize(input: HTMLInputElement, value: number) {
    if (Number.isFinite(value)) input.value = String(value);
  }
  group.addEventListener("input", render);
  start.addEventListener("change", () => normalize(start, read().start));
  width.addEventListener("change", () => normalize(width, read().width));

  function coordinate(event: PointerEvent, wall: Wall) {
    const matrix = plot.getScreenCTM();
    if (!matrix) return NaN;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return (vertical(wall) ? -point.y : point.x) / scale;
  }

  for (const grip of [move, startGrip, endGrip]) {
    let drag: { pointer: number; origin: number; port: Opening } | undefined;
    grip.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || drag || !event.isPrimary) return;
      const port = read();
      drag = {
        pointer: event.pointerId,
        origin: coordinate(event, port.wall),
        port,
      };
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", (event) => {
      if (drag?.pointer !== event.pointerId) return;
      const { port, origin } = drag;
      const delta = snap(coordinate(event, port.wall) - origin);
      const length = wallLength(port.wall);
      const end = port.start + port.width;
      const clamp = (value: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value));
      if (grip === startGrip) {
        const nextStart = clamp(port.start + delta, 0, end - spacing);
        set({ ...port, start: nextStart, width: end - nextStart });
      } else if (grip === endGrip) {
        const nextEnd = clamp(end + delta, port.start + spacing, length);
        set({ ...port, width: nextEnd - port.start });
      } else {
        set({
          ...port,
          start: clamp(port.start + delta, 0, length - port.width),
        });
      }
      render();
    });
    grip.addEventListener("lostpointercapture", () => {
      drag = undefined;
    });
  }

  return {
    set,
    render,
    commit() {
      const port = read();
      normalize(start, port.start);
      normalize(width, port.width);
      render();
      return port;
    },
  };
}
element("#grid-spacing").textContent = String(scene.gridSpacing);
const inletEditor = openingEditor("inlet", "Inlet");
const outletEditor = openingEditor("outlet", "Outlet");
function renderOpeningEditors() {
  inletEditor.render();
  outletEditor.render();
}
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
function showPressureScale() {
  // Use the solver mesh so changing the display density keeps the same key.
  const samples = model.fluidPressures().sort((a, b) => a - b);
  const last = samples.length - 1;
  let low = samples[Math.floor(0.05 * last)];
  let high = samples[Math.floor(0.95 * last)];
  if (low === high) {
    low = samples[0];
    high = samples[last];
  }
  const range = high - low;
  for (const [index, swatch] of swatches.entries()) {
    const hidden = range === 0 && index !== middleColour;
    swatch.hidden = hidden;
    const value = low + (index / lastColour) * range;
    const prefix =
      range && index === 0 ? "≤" : range && index === lastColour ? "≥" : "";
    const label = hidden ? "" : prefix + Number(value.toPrecision(3));
    if (swatch.textContent !== label) swatch.textContent = label;
  }
  return { low, range };
}

function draw() {
  const { low, range } = showPressureScale();
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
      const level = range
        ? Math.round(lastColour * Math.min(1, Math.max(0, (p - low) / range)))
        : middleColour;
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
  renderOpeningEditors();
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
        inlet: inletEditor.commit(),
        outlet: outletEditor.commit(),
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
  const defaults = new Cavity();
  outletEditor.set(defaults.settings.outlet);
  inletEditor.set(defaults.settings.inlet);
  reset(defaults);
  shape.value = "none";
  for (const input of [centreX, centreY, size])
    input.value = input.defaultValue;
  showObstacleEditor();
  setDimensions();
  rate.value = String(model.settings.flux);
  element("#feedback").textContent = "";
});
inletEditor.set(model.settings.inlet);
outletEditor.set(model.settings.outlet);
showConditions();
renderOpeningEditors();
draw();
