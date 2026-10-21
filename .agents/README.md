# Скиллы для Codex

В `skills/` установлены редактируемые копии 27 скиллов из основного набора
[mattpocock/skills](https://github.com/mattpocock/skills): Engineering и Productivity.
Источник и контрольные суммы установщика записаны в `../skills-lock.json`.
Лицензия исходного набора — MIT, текст сохранён в `LICENSE.mattpocock-skills`.

Вызывайте нужный скилл явно в запросе, например `$tdd` или `$grill-with-docs`.
Автоматическое использование запрещено правилами `../AGENTS.md` и отключено через
`policy.allow_implicit_invocation: false` в каждом `skills/*/agents/openai.yaml`.

Для первоначальной настройки трекера задач и документации явно вызовите
`$setup-matt-pocock-skills`.

## Скиллы проекта

- [`$record-browser-video`](skills/record-browser-video/SKILL.md) — запуск локального
  приложения, запись сценария через Chrome DevTools MCP и сохранение проверенного MP4
  в `artifacts/`. Нужны подключённый Chrome DevTools MCP, `ffmpeg` и `ffprobe`.
  Пример: `$record-browser-video запиши создание типа события и его выбор гостем`.
  Скилл вызывается явно; автоматическое использование отключено.

## Обновление внешнего набора

Обновление из корня репозитория:

```sh
npx skills@latest update -p -y
```

Обновление может перезаписать локальные настройки. После него проверьте diff и
восстановите `policy.allow_implicit_invocation: false` во всех `agents/openai.yaml`.
