# Календарь звонков


[![hexlet-check](https://github.com/bkoshelev/go-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/bkoshelev/go-project-386/actions)

Разработайте совместно с ИИ сервис для бронирования календаря

Учебный проект Хекслета: https://ru.hexlet.io/programs/go
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- Go (бэкенд будет добавлен отдельно)
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

## Релизы

Релизы подготавливает release-please. После попадания изменений в `main` он
создаёт или обновляет release PR с новой SemVer-версией и `CHANGELOG.md`.
Релиз публикуется только после ручного слияния этого PR: тогда создаются тег
`vX.Y.Z` и GitHub Release.

Версия вычисляется по [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: исправить отображение даты` повышает patch-версию;
- `feat: добавить повторяющиеся встречи` повышает minor-версию;
- `feat!: изменить формат API` или `BREAKING CHANGE:` в теле коммита
  обозначает несовместимое изменение и повышает major-версию.

Для обычных pull request рекомендуется squash merge с Conventional Commit в
заголовке PR. Так в `main` попадает один понятный коммит, а в changelog — одна
запись на завершённое изменение. Release-please сам не проверяет формат коммитов и
не публикует приложение или пакеты.

Подробности описаны в [спецификации](specs/release-please.md), а решение об общей
версии продукта — в [ADR-0004](docs/adr/0004-single-product-release.md).

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
