import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("dist", { recursive: true });
await build({
  entryPoints: ["apps/desktop/src/main.ts"],
  outfile: "dist/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node22",
});
await build({
  entryPoints: ["apps/desktop/src/preload.ts"],
  outfile: "dist/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
  target: "node22",
});
await build({
  entryPoints: ["apps/desktop/src/worker.ts"],
  outfile: "dist/worker.js",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  target: "node22",
});
await build({
  entryPoints: ["apps/desktop/src/renderer.tsx"],
  outfile: "dist/renderer.js",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "chrome130",
});
copyFileSync("apps/desktop/src/index.html", "dist/index.html");
copyFileSync("apps/desktop/src/style.css", "dist/style.css");

copyFileSync("apps/desktop/assets/brand.svg", "dist/brand.svg");

if (process.platform === "darwin")
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "apps/desktop/native/vision.swift",
      "-target",
      "arm64-apple-macosx14.0",
      "-module-cache-path",
      "/private/tmp/jojo-swift-cache",
      "-o",
      "dist/jojo-vision",
    ],
    { stdio: "inherit" },
  );
