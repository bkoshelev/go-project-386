# Календарь звонков


[![hexlet-check](https://github.com/bkoshelev/go-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/bkoshelev/go-project-386/actions)

Разработайте совместно с ИИ сервис для бронирования календаря

Учебный проект Хекслета: https://ru.hexlet.io/programs/go
Как это должно работать: https://files.hexlet.app/a/2ipc5m

Этот README — основной вход для [подготовки окружения](#установка),
[запуска и проверок](#использование). Подробности браузерного окружения принадлежат
[frontend/README.md](frontend/README.md#браузерная-проверка).

## Стек

- Go и Gin
- React, TypeScript, Vite и Mantine
- TypeSpec → OpenAPI → Go HTTP-слой oapi-codegen и TypeScript-клиент Hey API

## Установка

<!-- Опишите установку: клонирование, зависимости, переменные окружения -->

```bash
git clone https://github.com/bkoshelev/go-project-386.git
cd go-project-386
```

### Локальное окружение: mise

Установите [mise](https://mise.jdx.dev/installing-mise.html) **2026.10.17**
и добавьте его в `PATH` терминала и Orca. На macOS можно установить mise через
Homebrew; для Linux/WSL доступен официальный installer:

```bash
curl -fsSL https://mise.run | MISE_VERSION=2026.10.17 sh
```

Поддерживаются macOS и Linux на amd64/arm64, Windows через WSL. Для тестов
с `-race` нужен C-компилятор; для полных тестов — Docker с Linux-контейнерами.
На macOS Intel hk и pitchfork собираются из исходников: mise установит закреплённый
Rust, первая подготовка занимает несколько минут. На других платформах Cargo backend
использует официальные бинарники, когда они доступны.

Подготовка без shell activation:

```bash
mise trust mise.toml
mise run setup
# Повторная подготовка и полный набор backend/frontend-проверок
SETUP_VERIFY=1 mise run setup
```

Setup устанавливает инструменты, Go-модули, зависимости обоих пакетов, генерирует
API-клиент, устанавливает Chromium и локальный `commit-msg` hook. Он проверяет
результат и возвращает ошибку при сбое. `SETUP_VERIFY` принимает только `0` и `1`.
`mise install` также запускает повторяемую подготовку через `postinstall`.
Сервисы запускаются только явно.

[mise.toml](mise.toml) — источник команд; длинные сценарии находятся в
[mise-tasks/](mise-tasks/), версии и доступные метаданные установок — в [mise.lock](mise.lock).
Go читается из `backend/go.mod`, Node.js — из `frontend/.nvmrc`, pnpm — из
`frontend/package.json`. `GOTOOLCHAIN=local` запрещает смену Go toolchain.
Для source backends lockfile закрепляет версии, сборка Cargo использует Cargo.lock
самого инструмента; `--locked` mise доступен для backends с URL в lockfile.
Зависимости приложений остаются в языковых lock-файлах.

Необязательный `.env.local` загружается mise только из текущего worktree; пример —
[.env.local.example](.env.local.example). Он не копируется между worktree и исключён
из Git, как `.data/` и `mise.local.toml`. Direnv не требуется. Dev-сервисы получают
подключение БД и порты автоматически; явный `DATABASE_URL` в `.env.local` переопределит
подключение для ручных задач, поэтому не задавайте его для обычного dev-стека.

Для автоматической лёгкой диагностики при входе в каталог добавьте в `.zshrc`
`eval "$(mise activate zsh)"` (для Bash — `mise activate bash`). Hook `enter`
проверяет инструменты и launcher, ничего не устанавливает и не запускает сервисы.
Все задачи и Git hook работают без активации shell. Диагностика вручную:
`mise run doctor`. Список задач: `mise tasks ls`.

Git hook проверяет Conventional Commits без изменения сообщения; допустимые типы
читаются из `release-please-config.json`. Устанавливается только `commit-msg`
в общий каталог hooks репозитория, глобальный Git config не изменяется.
В CI заголовок PR проверяется той же задачей в строгом режиме, включая переименование.
Подробности решения — [спецификация](specs/mise-development-workflow.md).

### Фронтенд

После общего setup зависимости API/frontend и Chromium готовы. Для отдельной
подготовки после установки mise:

```bash
MISE_NO_HOOKS=1 mise install --locked node pnpm
mise run api:deps
mise run frontend:deps
mise run api:generate
mise run frontend:browser
```

На Linux системные библиотеки Chromium устанавливаются отдельно:
`mise run frontend:browser-deps` (может потребовать прав администратора).
После обновления Playwright повторите установку браузера.

### Контракт API и клиент

Контракт хранится в [`api/main.tsp`](api/main.tsp). [TypeSpec](https://typespec.io/)
генерирует из него OpenAPI 3.1 в `api/generated/openapi.yaml`, затем
[Hey API](https://heyapi.dev/docs/openapi/typescript/get-started) создаёт типы,
SDK и Fetch-клиент в `frontend/src/api/generated/`. Версии инструментов закреплены
в `package.json` и lock-файлах. Для обоих пакетов используются Node.js и pnpm,
указанные выше; `api/` устанавливается отдельно от `frontend/`.

Из корня проекта:

```bash
# Проверить контракт и его форматирование
mise run api:check

# Сгенерировать OpenAPI и клиент
mise run api:generate

# Отформатировать TypeSpec после редактирования
mise run api:format
```

`mise daemons start frontend`, `mise run frontend:build` и `mise run frontend:check` во фронтенде автоматически запускают
генерацию. После изменения контракта при работающем Vite выполните
`mise run api:generate` ещё раз. Каталоги `generated/` исключены из Git; их содержимое
пересоздаётся из TypeSpec, править его вручную не нужно. `mise run frontend:check` также
проверяет контракт, а сборка проверяет типы сгенерированного клиента.

Контракт описывает все операции бронирования. К серверу подключены liveness
`GET /healthz`, readiness `GET /readyz`, профиль `GET /api/owner`, каталог
`GET /api/event-types`, чтение типа `GET /api/event-types/{eventTypeId}`
и создание `POST /api/admin/event-types`. Остальные операции подключаются
в следующих задачах.
Пример использования клиента из кода фронтенда:

```ts
import { getHealth } from "./api/generated";

const { data } = await getHealth({ baseUrl: "http://localhost:8080" });
```

Адрес бэкенда задаётся явно при вызове либо через
`client.setConfig({ baseUrl })` из `./api/generated/client.gen`. Для запросов
между разными origin бэкенд должен разрешать CORS либо нужен прокси.
Генерация работает без запущенного Go-сервера и обращения к реестру Hey API.

Hey API 0.99.0 использует JavaScript API компилятора, отсутствующий в
TypeScript 7. Поэтому в отдельном пакете `api/` закреплён TypeScript 6.0.3
для генератора; приложение продолжает собираться TypeScript 7.
Причина ограничения: [hey-api/hey-api#4235](https://github.com/hey-api/hey-api/issues/4235).

### Генерация Go API

После изменения TypeSpec выполните из корня (нужны Go, Node.js и установленные
зависимости `api/`):

```bash
mise run backend:api-generate
```

Команда заново компилирует TypeSpec и запускает закреплённый в `backend/go.mod`
`oapi-codegen v2.8.0` через `go tool`. Конфигурация `backend/oapi-models.yaml`
создаёт модели и полную встроенную схему; `backend/oapi-server.yaml` — Gin-маршруты
и strict-интерфейс только для реализованных операций. При подключении сценария
добавьте его исходный `operationId` в `include-operation-ids` второй конфигурации.
Генератор приводит имена операций во встроенной схеме к Go-именам (`CreateBooking`).

Результат в `backend/internal/api/*.gen.go` хранится в Git; вручную его не меняют.
Отдельная задача CI повторяет генерацию и проверяет отсутствие изменений.
Обычные `go build`, `go test` и `mise run backend:check` используют сохранённый Go-код,
не запускают генерацию и не требуют Node.js или frontend.

В `backend/internal/httpserver/` проверка запросов выполняется до generated binding:
нормализация предусмотренных контрактом строк и времени в UTC, затем проверка
по полной встроенной схеме через `kin-openapi` и дополнительные правила полей
(точность минуты, IANA-пояс, дни недели и интервалы). Проверка схемы использует
`Schema.VisitJSON` с отдельными валидаторами форматов: адаптер JSON Schema 2020
в kin-openapi v0.142.0 теряет JSON Pointer и не применяет эти валидаторы.
Используемые контрактом ограничения входят в общий набор OpenAPI 3.0/3.1
и проверяются тестами. При расширении схемы новыми ключевыми словами 3.1 эту
границу нужно пересмотреть. Бизнес-правила доступности и хранение добавляются
вместе с соответствующими обработчиками; время в их ответах приводится к UTC.

### MCP для разработки интерфейса

В [`.codex/config.toml`](.codex/config.toml) настроены три MCP-сервера для Codex:

- [Playwright MCP](https://github.com/microsoft/playwright-mcp) — взаимодействие
  с интерфейсом, проверка сценариев и снимки экрана.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp) —
  диагностика консоли, сетевых запросов и производительности.
- [Mantine MCP](https://mantine.dev/guides/llms/#mcp-server-experimental) — поиск
  документации, свойств компонентов и примеров Mantine v9.

Конфигурация действует в этом проекте. По
[правилам Codex](https://developers.openai.com/codex/mcp/) проект должен быть
доверенным. После изменения конфигурации перезапустите сессию Codex. Проверить
регистрацию серверов можно командой `codex mcp list` из корня проекта, а активные
подключения — командой `/mcp` внутри Codex.

Нужны Node.js и `npx` в окружении Codex, доступ к npm при первой загрузке пакетов
и установленный Google Chrome для браузерных серверов. Chromium, установленный
для smoke-тестов фронтенда, настраивается отдельно и не заменяет Google Chrome
в этой конфигурации. Локально указан установленный на этой машине Chrome:
`/Applications/Browsers/Google Chrome.app/Contents/MacOS/Google Chrome`.
На другой машине замените этот путь в `args` обоих браузерных серверов:
`--executable-path` у Playwright и `--executablePath` у Chrome DevTools.
При стандартной установке Chrome эти параметры можно удалить.

Версии MCP-пакетов закреплены в конфигурации; они загружаются через `npx` и
не входят в зависимости приложения. Для Mantine нужны обращения к `mantine.dev`;
документация соответствует текущему Mantine v9, поэтому свойства сверяйте с
версией в `frontend/package.json`.

Браузерные серверы используют временные изолированные профили. У Chrome DevTools
отключена отправка статистики использования. Автоматические артефакты Playwright
попадают в `.mcp-output/playwright/` и исключены из Git. Для проверки локального
интерфейса запустите `mise daemons start frontend` из `frontend/` и передайте агенту адрес,
напечатанный Vite.

Подключение React DevTools к агенту описано в
[справочнике react-devtools-cdt-mcp](docs/agents/react-devtools-cdt-mcp.md):
порядок загрузки в Vite, настройка MCP, инструменты инспекции и профилирования.
Пакет подключён в development; сторонние инструменты Chrome DevTools MCP включены.

Для записи демонстрации в MP4 явно вызовите
[`$record-browser-video`](.agents/skills/record-browser-video/SKILL.md), например:
`$record-browser-video запиши создание типа события и его выбор гостем`.
Скилл использует Chrome DevTools MCP, проверяет видео через `ffmpeg` и `ffprobe`
и сохраняет результат в исключённый из Git каталог `artifacts/`.

### Бэкенд

Для подготовки только backend без клиентского окружения:

```bash
MISE_NO_HOOKS=1 mise install go golangci-lint go:golang.org/x/vuln/cmd/govulncheck sqlc
mise run backend:deps
```

Служебные инструменты устанавливает mise; ручная загрузка архивов не требуется.
Версии меняются в `mise.toml`, затем обновляется `mise.lock`.

### Подготовка worktree в Orca

В поле **Setup Script** сохранён прежний вход:

```bash
bash "$ORCA_WORKTREE_PATH/scripts/setup-worktree.sh"
```

Bootstrap нормализует путь, автоматически доверяет конфигурации именно текущего
worktree и вызывает `mise run setup`. Mise должен быть доступен в `PATH` Orca;
интерактивные shell hooks и direnv не нужны. Повторный запуск допустим.

```bash
ORCA_WORKTREE_PATH="$PWD" bash scripts/setup-worktree.sh
SETUP_VERIFY=1 ORCA_WORKTREE_PATH="$PWD" bash scripts/setup-worktree.sh
```

`SETUP_VERIFY=1` выполняет backend quality gates, frontend quality/build/smoke
и требует Docker. Ошибка подготовки или проверок завершает setup неуспешно.

## Использование

Dev-стек управляется штатными экспериментальными [mise daemons](https://mise.jdx.dev/daemons.html)
с закреплённым pitchfork как внутренней зависимостью. Вход/выход из каталога не
запускает и не останавливает сервисы.

```bash
mise daemons start             # весь стек (группа default)
mise daemons start postgres    # только БД
mise daemons start backend     # БД → backend, ожидание /readyz
mise daemons start frontend    # БД → backend → frontend
mise daemons restart frontend
mise daemons status
mise daemons ls --json         # порты, процессы, пути данных
mise daemons logs backend -n 50
mise daemons stop frontend
mise daemons stop              # весь стек текущего worktree
mise run dev:db-reset          # остановить стек и удалить dev-БД текущего worktree
```

Порты выделяются штатным `port = auto` по пути worktree; идентификаторы процессов
также раздельные. Адреса смотрите в `mise daemons ls --json`. Frontend слушает
`127.0.0.1:<frontend port>` и проксирует API к backend своего worktree через
`VITE_BACKEND_URL`. При занятом порте запуск завершается ошибкой, чужой процесс
не останавливается. Для редкого конфликта переопределите **всю** декларацию нужного
сервиса в gitignored `mise.local.toml`, задав другой `port`, и перезапустите его.

Нативная PostgreSQL 18 хранит данные в `.data/postgres` каждого worktree; остановка
сохраняет их. `dev:db-reset` удаляет только эту dev-БД, без перезапуска.
Временные PostgreSQL/процессы тестов и production Compose управляются отдельно.

### Запуск и проверки frontend

Команды доступны из любого каталога внутри проекта:

```bash
# Сервер разработки
mise daemons start frontend

# Линтеры, форматирование и проверка контракта
mise run frontend:check

# Проверка TypeScript и production-сборка
mise run frontend:build

# Сборка и smoke-тест production-версии в Chromium
mise run frontend:test-smoke
```

Для короткого цикла между изменениями используйте `mise run frontend:typecheck` после
[подготовки клиента](frontend/README.md#быстрая-проверка-типов).

Для разработки `mise daemons start frontend` проксирует API к backend согласно
[frontend/vite.config.ts](frontend/vite.config.ts).
Интеграционный smoke выбирает свободные порты через fixtures; фиксированный порт
для него не требуется. Требования и жизненный цикл окружения описаны в
[инструкции браузерной проверки](frontend/README.md#браузерная-проверка).

Дополнительные команды качества определены в [mise.toml](mise.toml):

| Команда             | Назначение                                                |
| ------------------- | --------------------------------------------------------- |
| `mise run frontend:lint-code`    | Проверить JS, TS, JSX и TSX с анализом типов              |
| `mise run frontend:lint-css`     | Проверить обычные CSS-файлы                               |
| `mise run frontend:lint`         | Последовательно выполнить обе lint-проверки               |
| `mise run frontend:lint-fix`     | Применить безопасные автоисправления Oxlint и Stylelint   |
| `mise run frontend:format`       | Отформатировать поддерживаемые frontend-файлы через Oxfmt |
| `mise run frontend:format-check` | Проверить форматирование без изменения файлов             |

Исправления запускаются только явно; lint и CI исходники не изменяют.
Настройки форматирования принадлежат [Oxfmt config](frontend/.oxfmtrc.jsonc).
Ограничения статических проверок и правила подавлений — в
[инструкции frontend](frontend/README.md#команды-качества).

### Бэкенд

Backend-команды имеют префикс `backend:`. `mise run check` проверяет оба приложения:

```bash
# Установить или переустановить закреплённые инструменты
MISE_NO_HOOKS=1 mise install go golangci-lint go:golang.org/x/vuln/cmd/govulncheck sqlc

# Проверить конфигурацию, форматирование, импорты и линтеры без изменения файлов
mise run backend:lint

# Применить gofmt и goimports
mise run backend:fmt

# Применить доступные автоисправления линтеров и вывести diff для просмотра
mise run backend:lint-fix

# Проверить вызываемые известные уязвимости
mise run backend:vuln

# Все тесты, включая PostgreSQL в Docker, с детектором гонок
mise run backend:test

# Тесты без Docker, также с детектором гонок
mise run backend:test-unit

# Выполнить lint, проверку генерации, vet, race-тесты, сборку и проверку уязвимостей
mise run backend:check
```

`mise run backend:lint` никогда не исправляет файлы. Изменяющие команды `mise run backend:fmt` и
`mise run backend:lint-fix` запускаются только явно; после них необходимо просмотреть diff.
Обычные Go-команды остаются доступны и выполняются из папки `backend/`:

```bash
# Выбрать заранее установленный Go из backend/go.mod и запретить автоматическую смену версии
export GOTOOLCHAIN=local
go version

# Подключение к заранее доступной PostgreSQL 18 и запуск сервера
export DATABASE_URL='postgres://user:password@localhost:5432/calendar?sslmode=disable'
go run ./cmd/server

# Все тесты без кэша результатов (нужен Docker)
go test -count=1 ./...

# Тесты без Docker
go test -race -tags=unit ./...

# Только smoke-тест HTTP-роутера
go test ./internal/httpserver -run TestSmokeHealth -count=1

# Статический анализ и тесты с детектором гонок
go vet ./...
go test -race -count=1 ./...

# Сборка исполняемого файла
go build -o bin/server ./cmd/server
```

Линтеры проверяют весь backend вместе с тестами. Подавление допускается только
точечной директивой `//nolint:<имя>` с содержательной причиной; общее или
необъяснённое подавление само считается ошибкой. Baseline и проверка только
изменённых строк не используются.

Диагностика линтера означает дефект исходного кода или нарушение согласованного
стиля. Govulncheck отдельно сопоставляет реально вызываемый код с обновляемой
базой известных уязвимостей. Недоступность базы или сбой инструмента — это ошибка
инфраструктуры, а не чистый результат сканирования; проверку следует повторить
после восстановления сервиса. Найденную уязвимость нужно зафиксировать с её
идентификатором, затронутым компонентом и предложенным исправлением, а обновление
зависимости выполнить отдельной задачей.

Обнаруженные блокеры и статус их исправления записаны в
[списке блокеров](docs/backend-vulnerability-blockers.md).
Результаты проверки реализации и фактически проверенные платформы — в
[отчёте проверок](docs/backend-linters-validation.md).

При прямом запуске без `PORT` и `HTTP_ADDR` сервер слушает `127.0.0.1:8080`.
`PORT` задаёт порт на `0.0.0.0`; явный `HTTP_ADDR` имеет приоритет. Для запуска
нужен `DATABASE_URL` (пример выше). Например:

```bash
HTTP_ADDR=0.0.0.0:8080 go run ./cmd/server
```

Файл `.env` автоматически не загружается. Пустой `HTTP_ADDR`, неверный адрес,
некорректный `PORT`, отсутствующий или неверный `DATABASE_URL`, ошибка миграций
или занятый порт завершают запуск с ошибкой.

Проверить запущенный сервер можно командой:

```bash
curl -i http://127.0.0.1:8080/healthz
```

Успешный ответ `{"status":"ok"}` означает, что процесс принимает HTTP-запросы.
Он не проверяет базу данных или готовность будущих внешних зависимостей.

### Окружение БД

HTTP-сервер подключается к БД и применяет миграции перед открытием порта;
`/healthz` сохраняет смысл liveness из
[ADR-0008](docs/adr/0008-backend-liveness-endpoint.md), а `/readyz` отдельно
проверяет доступность БД. Порядок запуска описан в
[ADR-0016](docs/adr/0016-migrations-at-container-startup.md).
Для полного `mise run backend:test` и `mise run backend:check` требуется работающий Docker Engine
или Docker Desktop с Linux-контейнерами и доступом к Docker Hub при первой
загрузке образов. В CI используется Docker на GitHub Actions Ubuntu runner.
Недоступность Docker, ошибка запуска БД или очистки завершают тесты ошибкой.
Полный запуск использует `-count=1`, чтобы кэш Go не подменял проверку реальной БД.
`mise run backend:test-unit` исключает интеграционный пакет тегом `unit` и работает без Docker.
Подготовка Orca с `SETUP_VERIFY=1` также требует Docker.

Testcontainers запускает один `postgres:18.6-alpine` на интеграционный пакет,
применяет схему, один раз загружает YAML-фикстуры через
[testfixtures](https://github.com/go-testfixtures/testfixtures) и удаляет
контейнер после тестов. Фикстуры находятся в
`backend/internal/database/integration/testdata/fixtures/`; имя YAML-файла
соответствует таблице. Пример `example_records.yml` содержит одну запись,
которую `TestExampleRecordFixtureCanBeRead` читает через sqlc и проверяет.
Ошибка создания загрузчика или загрузки данных завершает тесты неуспешно.
Для этих тестов постоянная локальная БД и Docker Compose не нужны.
В каждом обычном тесте sqlc работает в отдельной
транзакции; `t.Cleanup` явно откатывает её с новым ограниченным по времени
контекстом, даже если контекст запросов уже отменён. Цикл миграций
`up → повторный up → down → up` проверяется в отдельной временной базе того же
контейнера; эта база удаляется после проверки. Общий набор фикстур не загружается
заново внутри каждого теста: загрузчик очищает таблицы, поэтому ему требуется
исключительный доступ на этапе подготовки. Проверка генерации UUIDv7 создаёт
новую запись без переданного ID и не использует фиксированный ID из YAML.

Go-пакет `backend/internal/database/db/` генерируется sqlc из
`backend/internal/database/queries/` и SQL-миграций goose в
`backend/internal/database/migrations/`. Сгенерированные файлы хранятся в Git;
обычная сборка не требует sqlc. Единственный источник схемы — миграции,
отдельного `schema.sql` нет. Новые миграции получают последовательные имена
`00002_….sql`, `00003_….sql` и содержат секции `-- +goose Up` и
`-- +goose Down`. Текущий пример `example_records` содержит `id UUID` с
`DEFAULT uuidv7()` и `value TEXT NOT NULL`; предметная схема добавляется отдельно.

После изменения запросов или миграций выполните из корня:

```bash
# Установить только закреплённый sqlc, если остальные инструменты уже готовы
MISE_NO_HOOKS=1 mise install sqlc

# Обновить Go-код и включить результат в коммит
mise run backend:sqlc-generate

# Проверить актуальность генерации без изменения рабочего дерева
mise run backend:sqlc-check
```

Генерация и её проверка выполняются без Docker и запущенной БД. `mise run backend:check`
и backend CI включают проверку генерации; она обнаруживает изменённые,
отсутствующие и лишние файлы.

Миграции встроены в общий Go-пакет; тесты и `cmd/migrate` используют одни
SQL-файлы. Для ручного применения нужна заранее доступная PostgreSQL 18:
команды не запускают БД. Они принимают `-dsn` или `DATABASE_URL`.
Передайте своё подключение явно:

```bash
export DATABASE_URL='postgres://user:password@localhost:5432/database?sslmode=disable'
mise run backend:migrate-status
mise run backend:migrate-up
mise run backend:migrate-down # Откатить последнюю применённую миграцию

# Та же команда напрямую из backend/; флаг должен предшествовать операции
go run ./cmd/migrate -dsn "$DATABASE_URL" status
```

`up` применяет все ожидающие миграции и допускает повторный вызов, `down`
откатывает одну последнюю миграцию, `status` выводит версии и их состояние.
Решения и границы реализации описаны в
[спецификации](specs/database-environment.md) и
[ADR-0014](docs/adr/0014-postgresql-and-sqlc.md).

## Контейнерный запуск

Frontend и backend доступны на одном origin из единого Docker-образа,
PostgreSQL 18 запускается отдельно. Для локального окружения:

```bash
export POSTGRES_PASSWORD="$(openssl rand -hex 24)"
docker compose up --build -d
```

Приложение: <http://127.0.0.1:8080>, готовность с проверкой БД: `/readyz`.
Миграции применяются автоматически до HTTP; `DATABASE_URL` обязателен
также при прямом запуске backend. Контейнерная проверка: `mise run container:test`.

Конфигурация, сохранение данных, отдельная команда миграций, smoke и настройки
Render описаны в [инструкции запуска](docs/runbooks/production-environment.md).

## Релизы

Релизы подготавливает release-please. Цепочка выпуска:
`commit → release PR → ручное слияние → тег и GitHub Release`. После попадания
изменений в `main` он создаёт или обновляет release PR с новой общей
SemVer-версией в корневом `version.txt` и записями в `CHANGELOG.md`.
`version.txt` позволяет локальной сборке получить версию продукта без Git или
CI. Релиз публикуется только после ручного слияния release PR: тогда создаются
тег `vX.Y.Z` и GitHub Release.

Версия вычисляется по [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: исправить отображение даты` повышает patch-версию;
- `feat: добавить повторяющиеся встречи` повышает minor-версию;
- `docs`, `chore`, `ci`, `build`, `test`, `refactor`, `style`, `perf`, `revert`
  и `deps` тоже попадают в changelog и инициируют patch-релиз, если среди изменений
  нет новой возможности или breaking change; `feature` — синоним `feat`;
- `feat!: изменить формат API` или `BREAKING CHANGE:` в теле коммита
  обозначает несовместимое изменение; до `1.0.0` оно повышает minor-версию.

Changelog включает все перечисленные типы Conventional Commits, в том числе
изменения документации и инфраструктуры. Новый тип нужно добавить в
`changelog-sections` в `release-please-config.json`. Сообщения без Conventional
Commit-заголовка, включая обычные merge-коммиты, пропускаются. В `main` записи
появляются после слияния release PR.

Переход на любой новый major требует отдельного решения команды. Breaking marker
нельзя добавлять в `main` без такого решения; после его принятия точную версию
можно задать футером коммита, например `Release-As: 1.0.0`. Номер версии в
release PR необходимо проверить перед ручным слиянием.

Для обычных pull request рекомендуется squash merge с Conventional Commit в
заголовке PR. Так в `main` попадает один понятный коммит, а в changelog — одна
запись на завершённое изменение. Release-please сам не проверяет формат коммитов и
не выполняет deployment, не публикует приложение, пакеты или контейнеры.

Подробности описаны в [спецификации](specs/release-please.md), а решение об общей
версии продукта — в [ADR-0004](docs/adr/0004-single-product-release.md). Выбор
корневого файла версии зафиксирован в
[ADR-0005](docs/adr/0005-repository-product-version.md).

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
