const nx = 48;
const ny = 32;
const h = 1 / 32;
const stride = nx + 2;
const cells = nx * ny;
const padded = stride * (ny + 2);

export const scene = Object.freeze({
  gridSpacing: h,
  width: nx * h,
  height: ny * h,
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
function validateOpening(name: string, opening: Opening) {
  const length = vertical(opening.wall) ? scene.height : scene.width;
  if (
    !(
      opening.start >= 0 &&
      opening.width > 0 &&
      opening.start + opening.width <= length
    )
  )
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
function boundaryFace(wall: Wall, index: number) {
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
function openingFaces(opening: Opening) {
  return Array.from({ length: opening.width / h }, (_, i) =>
    boundaryFace(opening.wall, opening.start / h + i),
  );
}
function outwardSign(wall: Wall) {
  return wall === "left" || wall === "bottom" ? -1 : 1;
}

function outletBoundary(opening: Opening) {
  return openingFaces(opening).map((face, i) => {
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
const band = ny + 1;
function pressureFactor(outletCells: Set<number>): Float64Array {
  const lower = new Float64Array(cells * band);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const row = i * ny + j;
      const base = row * band;
      const outlet = outletCells.has(row);
      // Dirichlet p=0 lies half a cell from the last pressure centre.
      lower[base] =
        Number(i > 0) +
        Number(i < nx - 1) +
        Number(j > 0) +
        Number(j < ny - 1) +
        (outlet ? 2 : 0);
      if (i > 0) lower[base + ny] = -1;
      if (j > 0) lower[base + 1] = -1;
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

function solvePressure(rhs: Float64Array, factor: Float64Array): void {
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
  field: Float64Array,
  k: number,
  u: number,
  v: number,
  dt: number,
): number {
  const centre = field[k];
  const left = field[k - 1];
  const right = field[k + 1];
  const below = field[k - stride];
  const above = field[k + stride];
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

function interpolate(field: Float64Array, x: number, y: number): number {
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
  private u = new Float64Array(padded);
  private v = new Float64Array(padded);
  private nextU = new Float64Array(padded);
  private nextV = new Float64Array(padded);
  private pressure = new Float64Array(cells);

  readonly settings;
  private readonly inletFaces: number[];
  private readonly outletBoundary;
  private readonly factor;
  constructor({
    flux = scene.flux,
    inlet = defaultInlet,
    outlet = defaultOutlet,
  }: { flux?: number; inlet?: Opening; outlet?: Opening } = {}) {
    validateOpening("Inlet", inlet);
    validateOpening("Outlet", outlet);
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
    this.settings = Object.freeze({
      flux,
      inlet: Object.freeze({ ...inlet }),
      outlet: Object.freeze({ ...outlet }),
    });
    this.outletBoundary = outletBoundary(outlet);
    this.factor = pressureFactor(
      new Set(this.outletBoundary.map((entry) => entry.cell)),
    );
    this.inletFaces = openingFaces(inlet);
  }

  get outflow(): number {
    let total = 0;
    const { wall } = this.settings.outlet;
    const normal = vertical(wall) ? this.u : this.v;
    for (const { face } of this.outletBoundary) total += h * normal[face];
    return total * outwardSign(wall);
  }

  private setGhostFaces(): void {
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
      for (let k = 0; k < padded; k++) {
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
        const cross = (v[k] + v[k + 1] + v[k - stride] + v[k - stride + 1]) / 4;
        nextU[k] = predict(u, k, u[k], cross, dt);
      }
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * stride + i;
        const cross = (u[k] + u[k - 1] + u[k + stride] + u[k + stride - 1]) / 4;
        nextV[k] = predict(v, k, cross, v[k], dt);
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
    solvePressure(pressure, this.factor);
    for (const { face, cell } of this.outletBoundary)
      outletVelocity[face] += sign * 2 * pressure[cell];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = (j + 1) * stride + i + 1;
        const row = i * ny + j;
        if (i < nx - 1) nextU[k] += pressure[row] - pressure[row + ny];
        if (j < ny - 1) nextV[k] += pressure[row] - pressure[row + 1];
      }
    }
    this.u = nextU;
    this.v = nextV;
    this.nextU = u;
    this.nextV = v;
    this.setGhostFaces();
  }

  /** Sample velocity in metres per second, with y increasing from the floor. */
  velocity(x: number, y: number): [number, number] {
    if (x <= 0 || x >= scene.width || y <= 0 || y >= scene.height) {
      const side =
        x <= 0
          ? "left"
          : x >= scene.width
            ? "right"
            : y <= 0
              ? "bottom"
              : "top";
      const upright = vertical(side);
      const position = upright ? y : x;
      if (position <= 0 || position >= (upright ? scene.height : scene.width))
        return [0, 0];
      const face = boundaryFace(side, Math.floor(position / h));
      const outlet = this.settings.outlet;
      const free =
        side === outlet.wall &&
        position >= outlet.start &&
        position < outlet.start + outlet.width;
      return upright
        ? [this.u[face], free ? interpolate(this.v, x / h + 0.5, y / h) : 0]
        : [free ? interpolate(this.u, x / h, y / h + 0.5) : 0, this.v[face]];
    }
    return [
      interpolate(this.u, x / h, y / h + 0.5),
      interpolate(this.v, x / h + 0.5, y / h),
    ];
  }
}
