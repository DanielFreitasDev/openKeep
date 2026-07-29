## [1.8.1](https://github.com/DanielFreitasDev/openKeep/compare/v1.8.0...v1.8.1) (2026-07-29)


### Bug Fixes

* expand the composer with the picked image instead of silently saving ([c448863](https://github.com/DanielFreitasDev/openKeep/commit/c448863ca6af72ded869004b9b71438c882353b6))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.8.1
```

Or download `compose.yml` below (image pinned to `1.8.1`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.8.1/docs/DEPLOYMENT.md).

# [1.8.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.7.1...v1.8.0) (2026-07-29)


### Bug Fixes

* bottom sheets dismiss on outside tap ([7365d04](https://github.com/DanielFreitasDev/openKeep/commit/7365d04159013a55ce7a8dd3aaf97c660c4b9c3f))
* clear the selection when clicking empty grid space ([5e5790f](https://github.com/DanielFreitasDev/openKeep/commit/5e5790fd6d5eb91932045edb741e4870174afafa))
* keep the search bar theme swap instant ([cd05189](https://github.com/DanielFreitasDev/openKeep/commit/cd051896783a0219a5a2750eeb56d843a669bea6))


### Features

* drawing attachments api ([a58c038](https://github.com/DanielFreitasDev/openKeep/commit/a58c03816636bde4a18a45bb45137e7cf909eb3c))
* keep-style drawing editor ([cf65c42](https://github.com/DanielFreitasDev/openKeep/commit/cf65c4233b77cfdc365336bda77252a62145421d))
* keep-style refresh sync indicator and search focus elevation ([4ee7608](https://github.com/DanielFreitasDev/openKeep/commit/4ee76084f902c1878c6f90dba4772568141b7ecc))
* morph the editor open from its card, keep-style ([b59457a](https://github.com/DanielFreitasDev/openKeep/commit/b59457a6376dd971f0bb4f226f542ab1ac1101a2))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.8.0
```

Or download `compose.yml` below (image pinned to `1.8.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.8.0/docs/DEPLOYMENT.md).

## [1.7.1](https://github.com/DanielFreitasDev/openKeep/compare/v1.7.0...v1.7.1) (2026-07-29)


### Bug Fixes

* preview composer images before the note is saved ([97a3312](https://github.com/DanielFreitasDev/openKeep/commit/97a33126a3a906d5b93cfd29fc5e5dcb35a92e21)), closes [#1](https://github.com/DanielFreitasDev/openKeep/issues/1)


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.7.1
```

Or download `compose.yml` below (image pinned to `1.7.1`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.7.1/docs/DEPLOYMENT.md).

# [1.7.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.6.0...v1.7.0) (2026-07-29)


### Features

* 2-up mobile grid and app-style cards with long-press selection ([2615ffb](https://github.com/DanielFreitasDev/openKeep/commit/2615ffbbedf2fe8ed744f4d894c4e2b932684fcb))
* expandable create fab replaces the composer on mobile ([de8bd16](https://github.com/DanielFreitasDev/openKeep/commit/de8bd164340df92f465641eb50e3d02d4efab588))
* full-screen mobile editor with keep-app bottom sheets ([557bb31](https://github.com/DanielFreitasDev/openKeep/commit/557bb311754802560511b2dadb25f2bf2a20b4b3))
* keep-android search-pill top bar and full-height mobile drawer ([d384df4](https://github.com/DanielFreitasDev/openKeep/commit/d384df464e2e0fa671a5f70ea6ed52bf0b7caa25))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.7.0
```

Or download `compose.yml` below (image pinned to `1.7.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.7.0/docs/DEPLOYMENT.md).

# [1.6.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.5.0...v1.6.0) (2026-07-29)


### Bug Fixes

* show offline state and surface failed note saves ([60b138a](https://github.com/DanielFreitasDev/openKeep/commit/60b138a80d34d9dfbf1e07f61aa606f48a4c702e))


### Features

* keep local drafts of unsaved note edits and restore them ([74eda8c](https://github.com/DanielFreitasDev/openKeep/commit/74eda8c74a25e35a7a68b2f448ddeb22c9b31c26))
* queue offline note saves and replay them on reconnect ([d8f537a](https://github.com/DanielFreitasDev/openKeep/commit/d8f537a2fc2aefb0b79325b0f9ef887004454f4c))
* serve the app shell for offline SPA navigations ([26a9214](https://github.com/DanielFreitasDev/openKeep/commit/26a92142a63a54f6b6bbafb2a93c11fffe6feaf7))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.6.0
```

Or download `compose.yml` below (image pinned to `1.6.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.6.0/docs/DEPLOYMENT.md).

# [1.5.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.4.0...v1.5.0) (2026-07-29)


### Bug Fixes

* align the edit-labels icon on the collapsed sidebar rail ([3a38038](https://github.com/DanielFreitasDev/openKeep/commit/3a3803878580c83f7ebed46f4b639942507f2fe4))
* keep the grid scrolled where it was when opening a note ([aba7dc1](https://github.com/DanielFreitasDev/openKeep/commit/aba7dc1eca28570771be2ec5c160afb64e1e9bf1))


### Features

* tick checklist boxes from the card and show completed items ([b3b5ba9](https://github.com/DanielFreitasDev/openKeep/commit/b3b5ba96782cee549c2d950e664f9933a9fb700d))


### Performance Improvements

* render only the notes near the viewport ([934b50e](https://github.com/DanielFreitasDev/openKeep/commit/934b50e004fc13eee425e716c9b479dadfa9fd42))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.5.0
```

Or download `compose.yml` below (image pinned to `1.5.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.5.0/docs/DEPLOYMENT.md).

# [1.4.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.3.1...v1.4.0) (2026-07-29)


### Features

* enlarge note titles and thicken icon strokes ([3500627](https://github.com/DanielFreitasDev/openKeep/commit/3500627e295d4fc3a91aa86ba5ed2bd198474338))
* select notes by dragging a marquee over the grid ([78ecadc](https://github.com/DanielFreitasDev/openKeep/commit/78ecadcfae613555a2962c71d95efd10467bc0e8))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.4.0
```

Or download `compose.yml` below (image pinned to `1.4.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.4.0/docs/DEPLOYMENT.md).

## [1.3.1](https://github.com/DanielFreitasDev/openKeep/compare/v1.3.0...v1.3.1) (2026-07-29)


### Bug Fixes

* preserve every Takeout attachment and its note's edit date ([dc5f503](https://github.com/DanielFreitasDev/openKeep/commit/dc5f5039fd24b9c4d0d383fdec3f7e56ead3a9b3))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.3.1
```

Or download `compose.yml` below (image pinned to `1.3.1`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.3.1/docs/DEPLOYMENT.md).

# [1.3.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.2.1...v1.3.0) (2026-07-29)


### Bug Fixes

* record a version for every editing session ([0db2472](https://github.com/DanielFreitasDev/openKeep/commit/0db247203bcd3abf051dcf1b0e221ad2ddfabe52))


### Features

* give note titles a heavier, larger type scale ([c569d43](https://github.com/DanielFreitasDev/openKeep/commit/c569d43b316418b87be6e0f4f6569b82f8f0ef64))
* give the composer the editor's full toolbar ([62ea36c](https://github.com/DanielFreitasDev/openKeep/commit/62ea36c36d5acf2b01ba311c15bf766591036c58))
* open version history from the collapsed note card ([8a49649](https://github.com/DanielFreitasDev/openKeep/commit/8a496498b227db7e7db946b0dbf0e1c3a6b6e55a))
* replace native title tooltips with a Keep-style layer ([1cc0750](https://github.com/DanielFreitasDev/openKeep/commit/1cc0750d03de9bd8ce046e3ecab9bee26eb86cca))
* thicken icons to Material Symbols weight 500 ([1eab02f](https://github.com/DanielFreitasDev/openKeep/commit/1eab02f037c79e786c11cf5a4637161a480cb9c4))
* trash the whole selection with Delete or Backspace ([4f7a8ff](https://github.com/DanielFreitasDev/openKeep/commit/4f7a8ff8256bc0835d9d5e93e93be92dbb0e2c08))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.3.0
```

Or download `compose.yml` below (image pinned to `1.3.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.3.0/docs/DEPLOYMENT.md).

## [1.2.1](https://github.com/DanielFreitasDev/openKeep/compare/v1.2.0...v1.2.1) (2026-07-29)


### Bug Fixes

* apply the pre-hydration theme under the production CSP ([5c90eab](https://github.com/DanielFreitasDev/openKeep/commit/5c90eab9a639883af575f0dae0ec97bd44c96ede))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.2.1
```

Or download `compose.yml` below (image pinned to `1.2.1`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.2.1/docs/DEPLOYMENT.md).

# [1.2.0](https://github.com/DanielFreitasDev/openKeep/compare/v1.1.2...v1.2.0) (2026-07-29)


### Features

* add provider icons to the OAuth login buttons ([20bbed7](https://github.com/DanielFreitasDev/openKeep/commit/20bbed7b32319588af49e3847df44849d57c411f))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.2.0
```

Or download `compose.yml` below (image pinned to `1.2.0`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.2.0/docs/DEPLOYMENT.md).

## [1.1.2](https://github.com/DanielFreitasDev/openKeep/compare/v1.1.1...v1.1.2) (2026-07-28)


### Bug Fixes

* make card buttons respond to the first click ([350aff1](https://github.com/DanielFreitasDev/openKeep/commit/350aff162fe3859e615d3c3491e0f68db0c4eb5f))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.1.2
```

Or download `compose.yml` below (image pinned to `1.1.2`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.1.2/docs/DEPLOYMENT.md).

## [1.1.1](https://github.com/DanielFreitasDev/openKeep/compare/v1.1.0...v1.1.1) (2026-07-28)


### Bug Fixes

* point repository links at the renamed openKeep URL ([a6b7241](https://github.com/DanielFreitasDev/openKeep/commit/a6b72418c0c69b1beaf4f8908d73e792cd0ea725))


### Run it

```sh
docker pull ghcr.io/danielfreitasdev/openkeep:1.1.1
```

Or download `compose.yml` below (image pinned to `1.1.1`), set the env vars it lists,
and `docker compose up -d`. Deployment guide:
[docs/DEPLOYMENT.md](https://github.com/DanielFreitasDev/openKeep/blob/v1.1.1/docs/DEPLOYMENT.md).
