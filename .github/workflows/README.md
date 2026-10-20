# Automatic tests

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

## Контейнерный smoke

`container.yml` на push и pull request запускает `make test-container`: собирает
единый образ, проверяет его с отдельной PostgreSQL и Chromium, удаляет
изолированные ресурсы. При сбое маскированные логи и браузерная диагностика
доступны в artifact `container-smoke`. Подробности: [инструкция запуска](../../docs/runbooks/production-environment.md).
