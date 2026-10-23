# Changelog

## [0.6.0](https://github.com/bkoshelev/go-project-386/compare/v0.5.0...v0.6.0) (2026-10-23)


### Features

* add persistent event types and guest catalog ([#57](https://github.com/bkoshelev/go-project-386/issues/57)) ([cc81745](https://github.com/bkoshelev/go-project-386/commit/cc81745cfb69856617ea756ab60ac0d8907852ba)), closes [#34](https://github.com/bkoshelev/go-project-386/issues/34)
* **agents:** add browser video recording skill ([#60](https://github.com/bkoshelev/go-project-386/issues/60)) ([7aca10f](https://github.com/bkoshelev/go-project-386/commit/7aca10f2488fd32cbcfaa580900d7438c3dffc2c))
* **booking:** бронирование выбранного слота с защитой от конфликтов ([#72](https://github.com/bkoshelev/go-project-386/issues/72)) ([2e7762a](https://github.com/bkoshelev/go-project-386/commit/2e7762a859ef29a0c43c37c2e5472b8c99543290))
* **frontend:** добавить быстрый typecheck ([#75](https://github.com/bkoshelev/go-project-386/issues/75)) ([e61958d](https://github.com/bkoshelev/go-project-386/commit/e61958df1ffedaf500c2c3651e293a11350d7f0a)), closes [#54](https://github.com/bkoshelev/go-project-386/issues/54)
* **frontend:** обновить страницу управления типами событий ([#76](https://github.com/bkoshelev/go-project-386/issues/76)) ([b994fec](https://github.com/bkoshelev/go-project-386/commit/b994fec623896191e56198738a7a9a719e96347b))
* **scheduling:** собственные интервалы и блокировка конкретной даты ([#74](https://github.com/bkoshelev/go-project-386/issues/74)) ([fbf237c](https://github.com/bkoshelev/go-project-386/commit/fbf237c108848ac39ca75721d73a0cf3a99f4ac1))


### Documentation

* deduplicate agent instructions and guide context reading ([#55](https://github.com/bkoshelev/go-project-386/issues/55)) ([#73](https://github.com/bkoshelev/go-project-386/issues/73)) ([831206a](https://github.com/bkoshelev/go-project-386/commit/831206a47543e641890fd1b6ea3638ada2b4910a))


### Continuous Integration

* use preinstalled Chrome for Playwright smoke tests ([#69](https://github.com/bkoshelev/go-project-386/issues/69)) ([dd9bd33](https://github.com/bkoshelev/go-project-386/commit/dd9bd33b5a267c40167abf9ce5fc7da6d2ce4091))


### Miscellaneous Chores

* upgrade Go to 1.26.10 ([#58](https://github.com/bkoshelev/go-project-386/issues/58)) ([a37597d](https://github.com/bkoshelev/go-project-386/commit/a37597df62ff7e15573fb7f4b6b1fc347f164c1d))

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
