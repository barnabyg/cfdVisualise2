# Cavity flow

With Node.js 24.13 or later, npm and a browser installed, double-click `run.bat` on Windows. You can also start it from the repository root in PowerShell 7:

```powershell
.\run.bat
```

Open http://127.0.0.1:41673/ and press **Run**. If Cavity flow is already running, double-clicking `run.bat` opens it in your browser. The cavity starts with still fluid. The green opening low on the left admits the jet. The orange opening high on the right discharges it. The grid shows fixed sample locations. Arrowheads show velocity direction, and arrow length increases with speed on a fixed scale. Arrow colour shows kinematic pressure relative to the outlet. Blue marks lower pressure and coral marks higher pressure. The swatches show representative values in m²/s². The scale uses the mean outlet speed squared and stays fixed during playback. Pause to inspect the pressure pattern. Stop the local server with Ctrl+C.

Expand **Flow conditions** to see the current conditions and edit the scene. It starts collapsed and can be toggled during playback. Enter **0.09375** for Inlet rate and press **Apply**, then **Run**. The jet enters at half the default speed and calculated outflow rises from zero to 0.09375 m²/s. Restart replays the applied rate. Restore defaults returns to the original scene.

To compare inlets, keep the rate at **0.09375**, choose **Top**, position **0.25 m**, and width **0.1875 m**. Apply and run. The jet points down from the green inlet. Repeat with width **0.09375 m**. The mean entry speed doubles from 0.5 to 1 m/s. Positions and widths must be multiples of 0.03125 m. The minimum supported rate is the smallest normal double (about 2.23 × 10⁻³⁰⁸ m²/s), to preserve precision in the flux calculation. The maximum is 2.5 m/s times the smaller opening width.

For the Phase 2 outlet comparison, press **Restore defaults**. Set Outlet to **Top**, position **0.5 m**, width **0.1875 m**. Apply, run and pause near 1 s. Trace the arrows up to the orange opening. The former exit on the right is solid. Change only the outlet width to **0.09375 m**, apply and run again. The exit arrows lengthen on the same scale. Mean exit speed doubles from 1 to 2 m/s while calculated outflow remains **0.1875 m²/s**.

Use **Grid density** under Playback to change the spacing of the dots and velocity arrows. Pause a running simulation and switch from **Sparse** to **Dense** to inspect more locations at the same simulation time. The numerical solver uses the same mesh at every display density. The app starts with **Dense** selected. **Restore defaults** selects **Dense** again.

## Compare shallow and tall cavities

From the repository root in PowerShell 7, run the following command with Node.js 24.13 or later, npm and a browser installed.

```powershell
.\run.bat
```

Open http://127.0.0.1:41673/ and expand **Flow conditions**. Choose **Restore defaults** and change only **Cavity height** from 1 to **1.25 m**, apply, and run. Pause near 1 s. The outlet still starts 0.75 m above the floor. A longer wall rises above it, and arrows now develop in the added space. Restore defaults and repeat with only the width increased to **1.75 m**. The jet has farther to travel across the floor. Compare at the same simulation time. Arrow lengths use the same speed scale throughout.

Restore defaults and set **Playback → Grid density** to **Standard**. Set height to **0.875 m** and apply. The outlet extends past the top, so the original scene stays active. Leave that height in the editor, move the outlet position to **0.625 m**, and apply again. Run the shallow cavity and pause near **1 s**. Find the arrow just right of the horizontal midpoint, about **0.84 m above the floor**. It points almost horizontally to the right. Change only the height to **1.25 m**, keeping the corrected outlet at **0.625 m**. Apply, run and pause near **1 s** again. The arrow at the same physical location now points noticeably upward and to the right. **Restart** returns the applied cavity to rest. **Restore defaults** restores both dimensions, both openings and the inlet rate.

Each dimension supports **0.5 to 2 m** in steps of **0.03125 m**, bounding the size of the pressure solve while retaining square grid cells.

## Compare flow around an obstacle

With Node.js 24.13 or later, npm and a browser installed, start in the checkout root in PowerShell 7.

```powershell
.\run.bat
```

Open http://127.0.0.1:41673/ and expand **Flow conditions**. Restore defaults, then run the empty cavity and pause near **1 s**. Select **Square**, keeping the centre at **(0.5, 0.1875) m** and side length **0.25 m**. Apply, run and pause at the same time. The incoming jet splits around the square and its interior stays clear. Switch only the shape to **Circle**. Its diameter equals the previous side length. Apply, run and pause near **1 s** again. Compare the arrows where the square had upstream corners. The circular wall follows the edges of cells whose centres lie inside the disc. Restart retains the applied obstacle. Select **None**, apply and repeat to see the original jet again.

Coordinates are measured from the lower left. The bounding box must align with grid lines, span at least four cells and leave one fluid cell at each cavity wall. Edit the centre or size together with any cavity changes, then apply to start from rest.

## Numerical model

To check playback, pause near 2 s while the return current is developing. Watch the time and arrows hold, then resume and follow the same current. Restart while running or paused. The time should return to zero with a still field. Press Run again and look for the same turn above the inlet.

The 1.5 × 1 m cavity admits 0.1875 m²/s per unit depth through a 0.1875 m opening starting 0.0625 m above the floor. The inlet speed is 1 m/s. The equally wide outlet starts 0.75 m above the floor. Kinematic viscosity is 0.002 m²/s.

Around **1–2 simulated seconds**, watch for arrows turning left above the jet. By **3–5 s**, trace the jet along the floor, up the right side, back across the upper cavity and down the left. Around **20 s**, the pattern looks steady while the jet keeps flowing. The fixed arrow-length scale uses an inverse hyperbolic sine to make slow return currents legible alongside the faster jet.

A staggered grid (48 × 32 cells at the default size) advances the viscous incompressible momentum equations with upwind convection, centred diffusion and 0.0125 s display steps subdivided when needed for advection and diffusion stability. Each step solves the pressure Poisson equation by banded Cholesky factorisation and projects the face velocities. Stationary walls impose no slip. The inlet prescribes normal velocity. The outlet sets pressure to zero and its normal velocity follows from the projection.

The numerical test independently integrates outward-normal velocity on the cavity walls at 0.1, 1 and 6 simulated seconds. It requires inward flux at the inlet, outward flux at the outlet and relative imbalance below 0.1%. This tolerance covers face sampling and floating-point roundoff on the aligned grid. Flux balance does not estimate spatial discretisation error.

## Verification

After installing dependencies with `npm.cmd ci`, install the test browser with `npx.cmd playwright install chromium`. Run `npm.cmd run verify` for formatting, Biome lint and static analysis, strict TypeScript, numerical and browser tests, dependency audit, credential and package checks, and production compilation. The application builds into `dist/`.
