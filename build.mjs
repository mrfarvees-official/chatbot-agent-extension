import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
for (const f of ["manifest.json", "approve.html", "console.html"])
  cpSync(f, `dist/${f}`);

const options = {
  entryPoints: {
    background: "src/background.ts",
    bridge: "src/bridge.ts",
    content: "src/content.ts",
    approve: "src/approve.ts",
    console: "src/console.ts",
  },
  bundle: true,
  format: "iife",
  target: "chrome110",
  outdir: "dist",
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
