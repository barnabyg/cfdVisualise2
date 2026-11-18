# Cavity flow

From the repository root in PowerShell 7, with Node.js 24.13 or later, npm and a browser installed, run:

```powershell
npm.cmd run launch
```

Open http://127.0.0.1:5173/ and press **Run**. The cavity starts with still fluid. The green opening low on the left admits the jet. The orange opening high on the right discharges it. The grid shows fixed sample locations. Arrowheads show velocity direction, and arrow length increases with speed on a fixed scale. Stop the local server with Ctrl+C.

## Numerical model

A 48 × 32 staggered grid advances the viscous incompressible momentum equations with upwind convection, centred diffusion and a fixed 0.0125 s step. Each step solves the pressure Poisson equation by banded Cholesky factorisation and projects the face velocities. Stationary walls impose no slip. The inlet prescribes normal velocity. The outlet sets pressure to zero and its normal velocity follows from the projection.

The numerical test independently integrates outward-normal velocity on the two walls at 0.1, 1 and 6 simulated seconds. It requires inward flux at the inlet, outward flux at the outlet and relative imbalance below 0.1%. This tolerance covers face sampling and floating-point roundoff on the aligned grid. Flux balance does not estimate spatial discretisation error.

## Verification

After installing dependencies with `npm.cmd ci`, install the test browser with `npx.cmd playwright install chromium`. Run `npm.cmd run verify` for formatting, Biome lint and static analysis, strict TypeScript, numerical and browser tests, dependency audit, credential and package checks, and production compilation. The application builds into `dist/`.
