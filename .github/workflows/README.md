# Automatic tests

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

## Общие проверки

`check.yml` на push в `main` и события pull request запускает `mise run check`
в одном job. Он подготавливает инструменты и зависимости, проверяет доступность
Docker и Chrome. Команда включает свежесть Go API, backend, frontend, браузерные
тесты и контейнерный smoke; независимые ветки выполняются
параллельно. При ошибке mise останавливает оставшиеся задачи и может прервать
выполняющиеся проверки. При ошибке артефакт
`check-diagnostics` содержит доступные контейнерные логи и результаты Playwright.
Локально требуется Docker и Chromium из Playwright. Подробности контейнерного
smoke: [инструкция запуска](../../docs/runbooks/production-environment.md).
