# Automatic tests

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

## Проверки CI

На PR и push в main `check.yml` независимо запускает `lint` (`mise run check`),
`checks` (`mise run checks`), `test` (`mise run backend:test-ci`) и
`test-frontend` (`mise run frontend:test-smoke`). Итоговый `check` успешен только
при успехе всех четырёх. Новый PR-запуск отменяет прежний; выполняющиеся запуски
main не отменяются. Отчёт доступных job сохраняется на 7 дней; собственное время
завершения агрегатора доступно только после его окончания через GitHub API.
Диагностика Playwright при ошибке сохраняется на 7 дней.

`nightly.yml` ежедневно в 02:17 UTC и вручную независимо запускает
`backend:vuln`, `backend:test-race` и `container:test`. Выполняющийся ночной
запуск не отменяется новым. При сбое контейнерная диагностика хранится 7 дней.
Подробности: [production smoke](../../docs/runbooks/production-environment.md).
