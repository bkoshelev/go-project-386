# Changelog

## [0.5.0](https://github.com/bkoshelev/go-project-386/compare/v0.4.0...v0.5.0) (2026-10-20)


### Features

* add unified application container with external PostgreSQL ([#49](https://github.com/bkoshelev/go-project-386/issues/49)) ([1406d21](https://github.com/bkoshelev/go-project-386/commit/1406d2103c6b9b2715b2f47e5be4edbc88e1969e))
* **api:** define booking MVP contract and specifications ([#43](https://github.com/bkoshelev/go-project-386/issues/43)) ([f7b40db](https://github.com/bkoshelev/go-project-386/commit/f7b40dbf0cdaa0a9839109acc4070e154133248c))
* **backend:** add PostgreSQL migrations and sqlc test environment ([#46](https://github.com/bkoshelev/go-project-386/issues/46)) ([b8b4097](https://github.com/bkoshelev/go-project-386/commit/b8b4097ae78179b79e9e01d94ca2541a6a4d922a))
* **backend:** generate Go HTTP API from TypeSpec ([#45](https://github.com/bkoshelev/go-project-386/issues/45)) ([a8bd3d6](https://github.com/bkoshelev/go-project-386/commit/a8bd3d6cce23565e5900f0510d995b856e18f6be))


### Documentation

* allow chained skill invocations ([#47](https://github.com/bkoshelev/go-project-386/issues/47)) ([6108f35](https://github.com/bkoshelev/go-project-386/commit/6108f35aa2bc5ca27c9976958e383fb695befe41))


### Miscellaneous Chores

* **dev:** configure mise and direnv with database fixtures ([#48](https://github.com/bkoshelev/go-project-386/issues/48)) ([6a9fc65](https://github.com/bkoshelev/go-project-386/commit/6a9fc65d1e7b5e36c2debe60d7996e91cff9ea86))

## [0.4.0](https://github.com/bkoshelev/go-project-386/compare/v0.3.3...v0.4.0) (2026-10-19)


### Features

* **api:** generate frontend client from TypeSpec contract ([#21](https://github.com/bkoshelev/go-project-386/issues/21)) ([fc09776](https://github.com/bkoshelev/go-project-386/commit/fc09776889b74f5bdf07ae776c568e51e4cf6c67))
* **frontend:** add meeting calendar home page ([#20](https://github.com/bkoshelev/go-project-386/issues/20)) ([d34066c](https://github.com/bkoshelev/go-project-386/commit/d34066c5724a901c225bc5c272b7659fa1af69f3))


### Miscellaneous Chores

* configure project MCP servers for UI development ([#18](https://github.com/bkoshelev/go-project-386/issues/18)) ([d332d3e](https://github.com/bkoshelev/go-project-386/commit/d332d3e183c4ff7d65b99e685fbc3f63857cfc76))

## [0.3.3](https://github.com/bkoshelev/go-project-386/compare/v0.3.2...v0.3.3) (2026-10-19)


### Documentation

* add repository agent guidelines ([#14](https://github.com/bkoshelev/go-project-386/issues/14)) ([317a2df](https://github.com/bkoshelev/go-project-386/commit/317a2df17aa06fd5007b2aae8d312ead91eead1d))


### Miscellaneous Chores

* add Orca worktree setup script ([fe12d3e](https://github.com/bkoshelev/go-project-386/commit/fe12d3e9eb2d370b470ac112ea28debf7e1965e5))
* add Orca worktree setup script ([cb1abaf](https://github.com/bkoshelev/go-project-386/commit/cb1abaf3a98c8ac8ac1c76465f5d6d210ef3e03b))
* install and configure Matt Pocock skills ([#17](https://github.com/bkoshelev/go-project-386/issues/17)) ([198a25e](https://github.com/bkoshelev/go-project-386/commit/198a25e11ec8cea8653ae77386d7f3f1fefae20e))

## [0.3.2](https://github.com/bkoshelev/go-project-386/compare/v0.3.1...v0.3.2) (2026-10-13)


### Bug Fixes

* **backend:** harden pinned tooling and quality checks ([7f32a9d](https://github.com/bkoshelev/go-project-386/commit/7f32a9de91e4b890601ad68856e48c8298881cc0))
* **backend:** harden quality checks and fix reported vulnerabilities ([a49b05c](https://github.com/bkoshelev/go-project-386/commit/a49b05c9793ca9e18354d7b4cb04e187b76370a1))
* **backend:** update Go and dependencies to clear vulnerability checks ([9c8de13](https://github.com/bkoshelev/go-project-386/commit/9c8de1353418f90a96facb29bb63882668a9d48f))

## [0.3.1](https://github.com/bkoshelev/go-project-386/compare/v0.3.0...v0.3.1) (2026-09-17)


### Bug Fixes

* **backend:** update quic-go vulnerability patch ([57161c8](https://github.com/bkoshelev/go-project-386/commit/57161c8c8422d1a89688db93b626011042669df1))

## [0.3.0](https://github.com/bkoshelev/go-project-386/compare/v0.2.0...v0.3.0) (2026-09-17)


### Features

* **frontend:** add linting quality gate ([80bcd7c](https://github.com/bkoshelev/go-project-386/commit/80bcd7cd78f03e9e64d80253e41b2bc03e117060))
* **frontend:** add linting quality gate ([1800ac0](https://github.com/bkoshelev/go-project-386/commit/1800ac06a7ccc3163cc5277fc9c256ec0e660f47))

## [0.2.0](https://github.com/bkoshelev/go-project-386/compare/v0.1.0...v0.2.0) (2026-09-17)


### Features

* add standalone Go backend ([608b720](https://github.com/bkoshelev/go-project-386/commit/608b72007240e25e044d589a221b0388b18ae13b))
* add standalone Go backend ([17e5d8c](https://github.com/bkoshelev/go-project-386/commit/17e5d8ca31152f257c2eb1ee16036436070348b1))

## 0.1.0 (2026-09-17)


### Features

* добавить основу фронтенда и автоматизацию релизов ([9daf042](https://github.com/bkoshelev/go-project-386/commit/9daf04232dbb3dae65edd0cf70d3e21cff655da0))


### Bug Fixes

* настроить хранение версии release-please ([50d306c](https://github.com/bkoshelev/go-project-386/commit/50d306c715a6e3b55f1ef9eb4b53b1285f5a385f))
* настроить хранение версии release-please ([2dd861a](https://github.com/bkoshelev/go-project-386/commit/2dd861a75fda64dc39ecfb58fb5732894f1dc961))

## Changelog

Значимые изменения проекта будут автоматически добавляться сюда в release PR.
