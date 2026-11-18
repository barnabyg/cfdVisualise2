import { copyFile, mkdir } from "node:fs/promises";
import { build, stop } from "esbuild";
await mkdir("dist", { recursive: true });
await Promise.all([
  build({
    entryPoints: ["src/viewer.ts"],
    outfile: "dist/viewer.js",
    bundle: true,
    target: "es2022",
  }),
  copyFile("index.html", "dist/index.html"),
  copyFile("style.css", "dist/style.css"),
]);
await stop();
