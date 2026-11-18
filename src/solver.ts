const h = 1 / 32;

export const scene = Object.freeze({
  gridSpacing: h,
  minDimension: 0.5,
  maxDimension: 2,
  width: 1.5,
  height: 1,
  inletBottom: 2 * h,
  outletBottom: 24 * h,
  openingWidth: 6 * h,
  flux: 6 * h,
  viscosity: 0.002,
  dt: 0.0125,
});

export type Wall = "left" | "right" | "bottom" | "top";
export interface Opening {
  readonly wall: Wall;
  readonly start: number;
  readonly width: number;
}
const defaultInlet: Opening = {
  wall: "left",
  start: scene.inletBottom,
  width: scene.openingWidth,
};
const defaultOutlet: Opening = {
  wall: "right",
  start: scene.outletBottom,
  width: scene.openingWidth,
};
export function vertical(wall: Wall) {
  return wall === "left" || wall === "right";
}
function gridCells(name: string, length: number) {
  if (
    !(
      length >= scene.minDimension &&
      length <= scene.maxDimension &&
      Number.isInteger(length / h)
    )
  )
    throw Error(
      `Cavity ${name} must be between ${scene.minDimension} and ${scene.maxDimension} m in multiples of ${h} m.`,
    );
  return length / h;
}

export interface Obstacle {
  readonly shape: "square";
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

interface Grid {
  nx: number;
  ny: number;
  stride: number;
}

// Row spans describe the same solid cells in the solver and the plot.
function resolveObstacle(
  obstacle: Obstacle | undefined,
  { nx, ny, stride }: Grid,
) {
  const solid = new Uint8Array(stride * (ny + 2));
  const spans: { row: number; start: number; end: number }[] = [];
  if (obstacle) {
    const { x, y, size } = obstacle;
    const left = (x - size / 2) / h,
      bottom = (y - size / 2) / h,
      cells = size / h;
    if (!(Number.isInteger(cells) && cells >= 4))
      throw Error(
        `Obstacle size must span at least four cells and be a multiple of ${h} m.`,
      );
    if (![left, bottom].every(Number.isInteger))
      throw Error(
        "Place the obstacle so its bounding box edges align with grid lines.",
      );
    if (left < 1 || bottom < 1 || left + cells >= nx || bottom + cells >= ny)
      throw Error(
        "Leave at least one fluid cell between the obstacle and every cavity wall.",
      );
    for (let row = bottom; row < bottom + cells; row++) {
      const start = left,
        end = left + cells;
      spans.push({ row, start, end });
      solid.fill(
        1,
        (row + 1) * stride + start + 1,
        (row + 1) * stride + end + 1,
      );
    }
  }
  return { solid, spans };
}

function validateOpening(
  name: string,
  opening: Opening,
  width: number,
  height: number,
) {
  const length = vertical(opening.wall) ? height : width;
  if (opening.start + opening.width > length) {
    const end = vertical(opening.wall) ? "top" : "right";
    throw Error(
      `${name} extends beyond the ${end} wall. Position plus width must fit within ${length} m.`,
    );
  }
  if (!(opening.start >= 0 && opening.width > 0))
    throw Error(
      name +
        " must fit within the " +
        length +
        " m wall and have positive width.",
    );
  if (
    ![opening.start, opening.width].every((value) =>
      Number.isInteger(value / h),
    )
  )
    throw Error(`${name} position and width must be multiples of ${h} m.`);
}

// MAC face offsets along a wall, starting at its lower or left end.
function boundaryFace({ nx, ny, stride }: Grid, wall: Wall, index: number) {
  switch (wall) {
    case "left":
      return (index + 1) * stride;
    case "right":
      return (index + 1) * stride + nx;
    case "bottom":
      return index + 1;
    case "top":
      return ny * stride + index + 1;
  }
}
function openingFaces(grid: Grid, opening: Opening) {
  return Array.from({ length: opening.width / h }, (_, i) =>
    boundaryFace(grid, opening.wall, opening.start / h + i),
  );
}
function outwardSign(wall: Wall) {
  return wall === "left" || wall === "bottom" ? -1 : 1;
}

function outletBoundary(grid: Grid, opening: Opening) {
  const { nx, ny } = grid;
  return openingFaces(grid, opening).map((face, i) => {
    const index = opening.start / h + i;
    const column = vertical(opening.wall)
      ? opening.wall === "left"
        ? 0
        : nx - 1
      : index;
    const row = vertical(opening.wall)
      ? index
      : opening.wall === "bottom"
        ? 0
        : ny - 1;
    return { face, cell: column * ny + row };
  });
}

// Constant negative Laplacian on pressure cells, factored once. Columns of
// the cavity are contiguous so the triangular factor needs only ny+1 bands.
function pressureFactor(
  { nx, ny, stride }: Grid,
  solid: Uint8Array,
  outletCells: Set<number>,
): Float64Array {
  const cells = nx * ny;
  const band = ny + 1;
  const lower = new Float64Array(cells * band);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const row = i * ny + j;
      const base = row * band;
      const outlet = outletCells.has(row);
      const k = (j + 1) * stride + i + 1;
      if (solid[k]) {
        lower[base] = 1;
        continue;
      }
      const left = i > 0 && !solid[k - 1];
      const below = j > 0 && !solid[k - stride];
      lower[base] =
        Number(left) +
        Number(below) +
        Number(i < nx - 1 && !solid[k + 1]) +
        Number(j < ny - 1 && !solid[k + stride]) +
        (outlet ? 2 : 0);
      if (left) lower[base + ny] = -1;
      if (below) lower[base + 1] = -1;
      for (let col = Math.max(0, row - ny); col <= row; col++) {
        let value = lower[base + row - col];
        for (let k = Math.max(0, row - ny); k < col; k++) {
          value -= lower[base + row - k] * lower[col * band + col - k];
        }
        lower[base + row - col] =
          col === row ? Math.sqrt(value) : value / lower[col * band];
      }
    }
  }
  return lower;
}

function solvePressure(
  rhs: Float64Array,
  factor: Float64Array,
  ny: number,
): void {
  const cells = rhs.length;
  const band = ny + 1;
  for (let row = 0; row < cells; row++) {
    let sum = rhs[row];
    for (let d = 1; d <= Math.min(row, ny); d++) {
      sum -= factor[row * band + d] * rhs[row - d];
    }
    rhs[row] = sum / factor[row * band];
  }
  for (let row = cells - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let d = 1; d <= Math.min(cells - 1 - row, ny); d++) {
      sum -= factor[(row + d) * band + d] * rhs[row + d];
    }
    rhs[row] = sum / factor[row * band];
  }
}

// Explicit upwind convection and centred viscous diffusion on each MAC face.
function predict(
  stride: number,
  field: Float64Array,
  k: number,
  u: number,
  v: number,
  dt: number,
  ghostOffset: number,
  solid: Uint8Array,
  cellOffset: number,
): number {
  const centre = field[k];
  // Mirror the tangential velocity across a solid wall half a cell away.
  const neighbour = (offset: number) =>
    Math.abs(offset) === ghostOffset &&
    solid[k + offset] &&
    solid[k + offset + cellOffset]
      ? -centre
      : field[k + offset];
  const left = neighbour(-1),
    right = neighbour(1);
  const below = neighbour(-stride),
    above = neighbour(stride);
  const convection =
    u * (u >= 0 ? centre - left : right - centre) +
    v * (v >= 0 ? centre - below : above - centre);
  return (
    centre -
    (dt / h) * convection +
    ((scene.viscosity * dt) / (h * h)) *
      (right + left + above + below - 4 * centre)
  );
}

function interpolate(
  stride: number,
  field: Float64Array,
  x: number,
  y: number,
): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const k = j * stride + i;
  const a = x - i;
  const b = y - j;
  return (
    (1 - b) * ((1 - a) * field[k] + a * field[k + 1]) +
    b * ((1 - a) * field[k + stride] + a * field[k + stride + 1])
  );
}

export class Cavity {
  time = 0;
  private readonly grid: Grid;
  private u: Float64Array;
  private v: Float64Array;
  private nextU: Float64Array;
  private nextV: Float64Array;
  private pressureScale = 0;
  private pressure: Float64Array;

  readonly settings;
  private readonly solid;
  readonly obstacleSpans;
  private readonly inletFaces: number[];
  private readonly outletBoundary;
  private readonly factor;
  constructor({
    width = scene.width,
    height = scene.height,
    flux = scene.flux,
    inlet = defaultInlet,
    outlet = defaultOutlet,
    obstacle,
  }: {
    width?: number;
    height?: number;
    flux?: number;
    inlet?: Opening;
    outlet?: Opening;
    obstacle?: Obstacle;
  } = {}) {
    const nx = gridCells("width", width);
    const ny = gridCells("height", height);
    validateOpening("Inlet", inlet, width, height);
    validateOpening("Outlet", outlet, width, height);
    if (
      inlet.wall === outlet.wall &&
      inlet.start < outlet.start + outlet.width &&
      outlet.start < inlet.start + inlet.width
    )
      throw Error("Move or resize an opening to avoid overlapping the other.");
    const limit = 2.5 * Math.min(inlet.width, outlet.width);
    // Subnormal rates can lose the specified flux in pressure projection.
    const minRate = 2 ** -1022;
    if (!(flux >= minRate && flux <= limit))
      throw Error(
        `Enter an inlet rate between ${minRate} and ${limit} m²/s for these widths.`,
      );
    const stride = nx + 2;
    this.grid = { nx, ny, stride };
    const { solid, spans } = resolveObstacle(obstacle, this.grid);
    this.solid = solid;
    this.obstacleSpans = spans;
    const padded = stride * (ny + 2);
    this.u = new Float64Array(padded);
    this.v = new Float64Array(padded);
    this.nextU = new Float64Array(padded);
    this.nextV = new Float64Array(padded);
    this.pressure = new Float64Array(nx * ny);
    this.settings = Object.freeze({
      width,
      height,
      flux,
      obstacle: obstacle && Object.freeze({ ...obstacle }),
      inlet: Object.freeze({ ...inlet }),
      outlet: Object.freeze({ ...outlet }),
    });
    this.outletBoundary = outletBoundary(this.grid, outlet);
    this.factor = pressureFactor(
      this.grid,
      solid,
      new Set(this.outletBoundary.map((entry) => entry.cell)),
    );
    this.inletFaces = openingFaces(this.grid, inlet);
  }

  get outflow(): number {
    let total = 0;
    const { wall } = this.settings.outlet;
    const normal = vertical(wall) ? this.u : this.v;
    for (const { face } of this.outletBoundary) total += h * normal[face];
    return total * outwardSign(wall);
  }

  private setGhostFaces(): void {
    const { nx, ny, stride } = this.grid;
    const outlet = this.settings.outlet;
    // Only tangential faces strictly inside the outlet are free slip.
    const reflection = (wall: Wall, index: number) =>
      wall === outlet.wall &&
      index * h > outlet.start &&
      index * h < outlet.start + outlet.width
        ? 1
        : -1;
    for (let i = 0; i <= nx; i++) {
      this.u[i] = reflection("bottom", i) * this.u[stride + i];
      this.u[(ny + 1) * stride + i] =
        reflection("top", i) * this.u[ny * stride + i];
    }
    for (let j = 0; j <= ny; j++) {
      const left = j * stride;
      this.v[left] = reflection("left", j) * this.v[left + 1];
      this.v[left + nx + 1] = reflection("right", j) * this.v[left + nx];
    }
  }

  step(): void {
    // Bound the explicit advection and diffusion step as the field develops.
    let remaining = scene.dt;
    while (remaining > 0) {
      let maxU = this.settings.flux / this.settings.inlet.width,
        maxV = 0;
      for (let k = 0; k < this.u.length; k++) {
        maxU = Math.max(maxU, Math.abs(this.u[k]));
        maxV = Math.max(maxV, Math.abs(this.v[k]));
      }
      const dt = Math.min(
        remaining,
        0.9 / ((maxU + maxV) / h + (4 * scene.viscosity) / (h * h)),
      );
      this.advance(dt);
      remaining -= dt;
    }
    this.time += scene.dt;
  }

  private advance(dt: number) {
    const { nx, ny, stride } = this.grid;
    const { u, v, nextU, nextV, pressure } = this;
    const { inlet, flux } = this.settings;
    const normal = vertical(inlet.wall) ? u : v;
    const predicted = vertical(inlet.wall) ? nextU : nextV;
    const inwardSign = -outwardSign(inlet.wall);
    for (const face of this.inletFaces) {
      normal[face] = (inwardSign * flux) / inlet.width;
      predicted[face] = normal[face];
    }
    this.setGhostFaces();
    for (let j = 1; j <= ny; j++) {
      const left = j * stride;
      for (let i = 1; i < nx; i++) {
        const k = left + i;
        if (this.solid[k] || this.solid[k + 1]) continue;
        const cross = (v[k] + v[k + 1] + v[k - stride] + v[k - stride + 1]) / 4;
        nextU[k] = predict(
          stride,
          u,
          k,
          u[k],
          cross,
          dt,
          stride,
          this.solid,
          1,
        );
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * stride + i;
        if (this.solid[k] || this.solid[k + stride]) continue;
        const cross = (u[k] + u[k - 1] + u[k + stride] + u[k + stride - 1]) / 4;
        nextV[k] = predict(
          stride,
          v,
          k,
          cross,
          v[k],
          dt,
          1,
          this.solid,
          stride,
        );
      }
    }
    const wall = this.settings.outlet.wall;
    const sign = outwardSign(wall);
    const outletVelocity = vertical(wall) ? nextU : nextV;
    const inwardOffset = -sign * (vertical(wall) ? 1 : stride);
    for (const { face } of this.outletBoundary)
      outletVelocity[face] = outletVelocity[face + inwardOffset];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = (j + 1) * stride + i + 1;
        pressure[i * ny + j] = -(
          nextU[k] -
          nextU[k - 1] +
          nextV[k] -
          nextV[k - stride]
        );
      }
    }
    solvePressure(pressure, this.factor, ny);
    // The projection stores (dt / h) times kinematic pressure.
    this.pressureScale = h / dt;
    for (const { face, cell } of this.outletBoundary)
      outletVelocity[face] += sign * 2 * pressure[cell];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = (j + 1) * stride + i + 1;
        const row = i * ny + j;
        if (this.solid[k]) continue;
        if (i < nx - 1 && !this.solid[k + 1])
          nextU[k] += pressure[row] - pressure[row + ny];
        if (j < ny - 1 && !this.solid[k + stride])
          nextV[k] += pressure[row] - pressure[row + 1];
      }
    }
    this.u = nextU;
    this.v = nextV;
    this.nextU = u;
    this.nextV = v;
    this.setGhostFaces();
  }

  /** Cell-centred kinematic pressure in m²/s², relative to the outlet. */
  pressureAt(x: number, y: number): number {
    const { nx, ny } = this.grid;
    const i = Math.max(0, Math.min(nx - 1, Math.floor(x / h)));
    const j = Math.max(0, Math.min(ny - 1, Math.floor(y / h)));
    return this.pressure[i * ny + j] * this.pressureScale;
  }

  /** Sample velocity in metres per second, with y increasing from the floor. */
  velocity(x: number, y: number): [number, number] {
    const { width, height } = this.settings;
    const { stride } = this.grid;
    if (x <= 0 || x >= width || y <= 0 || y >= height) {
      const side =
        x <= 0 ? "left" : x >= width ? "right" : y <= 0 ? "bottom" : "top";
      const upright = vertical(side);
      const position = upright ? y : x;
      if (position <= 0 || position >= (upright ? height : width))
        return [0, 0];
      const face = boundaryFace(this.grid, side, Math.floor(position / h));
      const outlet = this.settings.outlet;
      const free =
        side === outlet.wall &&
        position >= outlet.start &&
        position < outlet.start + outlet.width;
      return upright
        ? [
            this.u[face],
            free ? interpolate(stride, this.v, x / h + 0.5, y / h) : 0,
          ]
        : [
            free ? interpolate(stride, this.u, x / h, y / h + 0.5) : 0,
            this.v[face],
          ];
    }
    if (this.settings.obstacle) {
      // Include both neighbours when the sample lies exactly on a grid face.
      for (let j = Math.ceil(y / h); j <= Math.floor(y / h) + 1; j++)
        for (let i = Math.ceil(x / h); i <= Math.floor(x / h) + 1; i++)
          if (this.solid[j * stride + i]) return [0, 0];
    }
    return [
      interpolate(stride, this.u, x / h, y / h + 0.5),
      interpolate(stride, this.v, x / h + 0.5, y / h),
    ];
  }
}
