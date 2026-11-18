# Automatic tests

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

## Общие проверки

`check.yml` на push в `main` и события pull request запускает `mise run check`
в одном job. Он подготавливает инструменты и зависимости, проверяет доступность
Docker и Chrome. Команда включает свежесть Go API, backend, frontend, браузерные
тесты, контейнерный smoke и тесты команд окружения; независимые ветки выполняются
параллельно и не отменяются при ошибке другой ветки. При ошибке артефакт
`check-diagnostics` содержит доступные контейнерные логи и результаты Playwright.
Локально требуется Docker и Chromium из Playwright. Подробности контейнерного
smoke: [инструкция запуска](../../docs/runbooks/production-environment.md).
