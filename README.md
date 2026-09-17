# Календарь звонков


[![hexlet-check](https://github.com/bkoshelev/go-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/bkoshelev/go-project-386/actions)

Разработайте совместно с ИИ сервис для бронирования календаря

Учебный проект Хекслета: https://ru.hexlet.io/programs/go
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- Go и Gin
- React, TypeScript, Vite и Mantine

## Установка

<!-- Опишите установку: клонирование, зависимости, переменные окружения -->

```bash
git clone https://github.com/bkoshelev/go-project-386.git
cd go-project-386
```

### Фронтенд

Для фронтенда нужны Node.js 24.21.0 и pnpm 12.4.2. Версия Node.js записана в
`frontend/.nvmrc`, а версия pnpm — в поле `packageManager` файла
`frontend/package.json`.

Первоначальная подготовка окружения:

```bash
cd frontend
nvm install
nvm use
corepack enable
corepack prepare pnpm@12.4.2 --activate
pnpm install
pnpm exec playwright install chromium
```

Chromium устанавливается отдельно один раз при подготовке окружения. После
обновления Playwright установку браузера может потребоваться повторить.

### Бэкенд

Для бэкенда нужен Go 1.27.1. Версия закреплена в `backend/go.mod` и используется
локальными Go-командами и GitHub Actions.

Первоначальная подготовка окружения:

```bash
cd backend
go mod download
```

## Использование

<!-- Добавьте примеры запуска и запись asciinema — именно это смотрит работодатель -->

Все команды фронтенда выполняются из папки `frontend/`:

```bash
# Сервер разработки
pnpm dev

# Проверка TypeScript и production-сборка
pnpm build

# Сборка и smoke-тест production-версии в Chromium
pnpm test:smoke
```

Smoke-тест сам запускает сервер собранных файлов и останавливает его после
завершения. Бэкенд или заранее запущенный сервер для этих команд не нужны.

### Бэкенд

Все команды бэкенда выполняются из папки `backend/`:

```bash
# Запуск сервера
go run ./cmd/server

# Все тесты
go test ./...

# Только smoke-тест HTTP-роутера
go test ./... -run TestSmokeHealth -count=1

# Статический анализ и тесты с детектором гонок
go vet ./...
go test -race ./...

# Сборка исполняемого файла
go build -o bin/server ./cmd/server
```

По умолчанию сервер слушает `127.0.0.1:8080`. Адрес можно изменить только через
переменную окружения `HTTP_ADDR`, например:

```bash
HTTP_ADDR=0.0.0.0:8080 go run ./cmd/server
```

Файл `.env` автоматически не загружается. Пустое значение `HTTP_ADDR`, неверный
адрес или занятый порт завершают запуск с ошибкой.

Проверить запущенный сервер можно командой:

```bash
curl -i http://127.0.0.1:8080/healthz
```

Успешный ответ `{"status":"ok"}` означает, что процесс принимает HTTP-запросы.
Он не проверяет базу данных или готовность будущих внешних зависимостей.

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
- `feat!: изменить формат API` или `BREAKING CHANGE:` в теле коммита
  обозначает несовместимое изменение; до `1.0.0` оно повышает minor-версию.

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
