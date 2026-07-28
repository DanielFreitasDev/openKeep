#!/usr/bin/env node
/**
 * Writes dist-release/compose.yml — docker/compose.release.yml with the image
 * tag pinned to the version being released, attached as a release asset.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error(`pin-compose: expected a semver argument, got: ${version ?? '<nothing>'}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'docker/compose.release.yml'), 'utf8');
// biome-ignore lint/suspicious/noTemplateCurlyInString: compose interpolation, not JS
const placeholder = '${OPENKEEP_TAG:-latest}';
const pinned = source.replace(placeholder, `\${OPENKEEP_TAG:-${version}}`);
if (pinned === source) {
  console.error('pin-compose: OPENKEEP_TAG placeholder not found in docker/compose.release.yml');
  process.exit(1);
}

mkdirSync(path.join(root, 'dist-release'), { recursive: true });
writeFileSync(path.join(root, 'dist-release/compose.yml'), pinned);
console.info(`pin-compose: dist-release/compose.yml pinned to ${version}`);
