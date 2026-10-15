import { build, context } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
for (const f of ["manifest.json", "approve.html", "console.html"])
  cpSync(join(root, f), join(dist, f));

const options = {
  entryPoints: {
    background: join(root, "src/background.ts"),
    bridge: join(root, "src/bridge.ts"),
    content: join(root, "src/content.ts"),
    approve: join(root, "src/approve.ts"),
    console: join(root, "src/console.ts"),
  },
  bundle: true,
  format: "iife",
  target: "chrome110",
  outdir: dist,
  absWorkingDir: root,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
