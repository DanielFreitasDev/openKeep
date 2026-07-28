#!/usr/bin/env node
/**
 * Extra section appended to the generated release notes (semantic-release
 * concatenates the notes of every plugin that produces them).
 */
const version = process.argv[2];
const repo = process.env.GITHUB_REPOSITORY ?? 'DanielFreitasDev/openKeep';
const image = `ghcr.io/${repo.toLowerCase()}`;

console.info(
  [
    '',
    '### Run it',
    '',
    '```sh',
    `docker pull ${image}:${version}`,
    '```',
    '',
    `Or download \`compose.yml\` below (image pinned to \`${version}\`), set the env vars it lists,`,
    'and `docker compose up -d`. Deployment guide:',
    `[docs/DEPLOYMENT.md](https://github.com/${repo}/blob/v${version}/docs/DEPLOYMENT.md).`,
    '',
  ].join('\n'),
);
