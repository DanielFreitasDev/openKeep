import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Bundle our code (including workspace packages, which ship TS source);
// keep real npm dependencies external so the SDK resolves at runtime.
const external = Object.keys(pkg.dependencies).filter((d) => !d.startsWith('@openkeep/'));

await build({
  entryPoints: ['src/stdio.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
