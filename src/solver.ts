const nx = 48;
const ny = 32;
const h = 1 / 32;
const stride = nx + 2;
const cells = nx * ny;
const padded = stride * (ny + 2);

export const scene = Object.freeze({
  width: nx * h,
  height: ny * h,
  inletBottom: 2 * h,
  outletBottom: 24 * h,
  openingWidth: 6 * h,
  flux: 6 * h,
  viscosity: 0.002,
  dt: 0.0125,
});

function inOpening(row: number, bottom: number): boolean {
  const y = (row - 0.5) * h;
  return y > bottom && y < bottom + scene.openingWidth;
}

// Constant negative Laplacian on pressure cells, factored once. Columns of
// the cavity are contiguous so the triangular factor needs only ny+1 bands.
const band = ny + 1;
function pressureFactor(): Float64Array {
  const lower = new Float64Array(cells * band);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const row = i * ny + j;
      const base = row * band;
      const outlet = i === nx - 1 && inOpening(j + 1, scene.outletBottom);
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

const factor = pressureFactor();
function solvePressure(rhs: Float64Array): void {
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
function predict(field: Float64Array, k: number, u: number, v: number): number {
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
    (scene.dt / h) * convection +
    ((scene.viscosity * scene.dt) / (h * h)) *
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

  private setGhostFaces(): void {
    for (let i = 0; i <= nx; i++) {
      this.u[i] = -this.u[stride + i];
      this.u[(ny + 1) * stride + i] = -this.u[ny * stride + i];
    }
    for (let j = 0; j <= ny; j++) {
      const left = j * stride;
      this.v[left] = -this.v[left + 1];
      // Free tangential derivative across the opening, no slip elsewhere.
      const open =
        inOpening(j, scene.outletBottom) &&
        inOpening(j + 1, scene.outletBottom);
      this.v[left + nx + 1] = (open ? 1 : -1) * this.v[left + nx];
    }
  }

  step(): void {
    const { u, v, nextU, nextV, pressure } = this;
    for (let j = 1; j <= ny; j++) {
      u[j * stride] = inOpening(j, scene.inletBottom)
        ? scene.flux / scene.openingWidth
        : 0;
    }
    this.setGhostFaces();
    for (let j = 1; j <= ny; j++) {
      const left = j * stride;
      nextU[left] = u[left];
      for (let i = 1; i < nx; i++) {
        const k = left + i;
        const cross = (v[k] + v[k + 1] + v[k - stride] + v[k - stride + 1]) / 4;
        nextU[k] = predict(u, k, u[k], cross);
      }
      // Extrapolate the predictor through the open face. Projection below
      // determines its final velocity from the interior pressure gradient.
      nextU[left + nx] = inOpening(j, scene.outletBottom)
        ? nextU[left + nx - 1]
        : 0;
    }
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i <= nx; i++) {
        const k = j * stride + i;
        const cross = (u[k] + u[k - 1] + u[k + stride] + u[k + stride - 1]) / 4;
        nextV[k] = predict(v, k, cross, v[k]);
      }
    }
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
    solvePressure(pressure);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const k = (j + 1) * stride + i + 1;
        const row = i * ny + j;
        if (i < nx - 1) nextU[k] += pressure[row] - pressure[row + ny];
        else if (inOpening(j + 1, scene.outletBottom))
          nextU[k] += 2 * pressure[row];
        if (j < ny - 1) nextV[k] += pressure[row] - pressure[row + 1];
      }
    }
    this.u = nextU;
    this.v = nextV;
    this.nextU = u;
    this.nextV = v;
    this.setGhostFaces();
    this.time += scene.dt;
  }

  /** Sample velocity in metres per second, with y increasing from the floor. */
  velocity(x: number, y: number): [number, number] {
    if (y <= 0 || y >= scene.height) return [0, 0];
    if (x <= 0 || x >= scene.width) {
      const right = x >= scene.width;
      const row = 1 + Math.floor(y / h);
      const k = row * stride + (right ? nx : 0);
      const tangential =
        right && inOpening(row, scene.outletBottom)
          ? interpolate(this.v, nx + 0.5, y / h)
          : 0;
      return [this.u[k], tangential];
    }
    return [
      interpolate(this.u, x / h, y / h + 0.5),
      interpolate(this.v, x / h + 0.5, y / h),
    ];
  }
}
