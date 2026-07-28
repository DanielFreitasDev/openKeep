#!/usr/bin/env node
/**
 * Applies a release version across the monorepo.
 *
 * Run twice per release, on purpose: semantic-release's prepare step runs it to
 * produce the commit that gets tagged, and the image build runs it beforehand
 * on a throwaway checkout so the published container reports the version it was
 * released as (APP_VERSION feeds the OpenAPI spec and the MCP server handshake).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error(`set-version: expected a semver argument, got: ${version ?? '<nothing>'}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifests = [
  'package.json',
  'apps/server/package.json',
  'apps/web/package.json',
  'packages/config/package.json',
  'packages/mcp/package.json',
  'packages/shared/package.json',
  'e2e/package.json',
];

for (const rel of manifests) {
  const file = path.join(root, rel);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

const constants = path.join(root, 'packages/shared/src/constants/app.ts');
const before = readFileSync(constants, 'utf8');
const after = before.replace(
  /export const APP_VERSION = '[^']*';/,
  `export const APP_VERSION = '${version}';`,
);
if (after === before) {
  console.error(`set-version: APP_VERSION not found in ${constants}`);
  process.exit(1);
}
writeFileSync(constants, after);

console.info(`set-version: ${version} applied to ${manifests.length} manifests + APP_VERSION`);
