# React DevTools для агента: react-devtools-cdt-mcp

Дата сверки источников: 6 ноября 2026 года. Библиотека экспериментальная;
имена инструментов и формат результатов могут меняться.

## Назначение и устройство

`react-devtools-cdt-mcp` даёт агенту дерево React, props, Hooks, связи между
компонентами, расположение исходников и данные о рендерах. Библиотека работает
в браузере, а MCP-сервером служит `chrome-devtools-mcp`. В конфигурацию MCP
добавляется сервер Chrome; React-пакет подключается к приложению.
См. [обзор React](https://react.dev/reference/dev-tools/react-devtools-cdt-mcp).

Путь запроса: агент → Chrome DevTools MCP → инструменты страницы → React.
Chrome обнаруживает инструменты через событие `devtoolstooldiscovery` при
навигации, выборе страницы или явном запросе списка. React регистрирует группу
`react`. Подробнее — [описание механизма Chrome](https://developer.chrome.com/blog/devtools-for-agents-3p-tools).

## Версии и состояние проекта

| Часть | Состояние на дату сверки |
| --- | --- |
| `react-devtools-cdt-mcp` | В npm опубликована версия `0.1.0` |
| Chrome DevTools MCP | React указывает минимум `1.3.0` и флаг `--categoryExperimentalThirdParty=true` |
| MCP в проекте | В [`.codex/config.toml`](../../.codex/config.toml) закреплён `chrome-devtools-mcp@1.11.0`, сторонние инструменты включены |
| Frontend | React/React DOM `19.3.0`, Vite `8.3.0`; `src/bootstrap.ts` загружает DevTools перед React только в development |

Версия пакета проверена по [npm registry](https://registry.npmjs.org/react-devtools-cdt-mcp/latest),
минимальная версия сервера — по [README React-пакета](https://github.com/react/react/blob/main/packages/react-devtools-cdt-mcp/README.md).
Отсутствие `peerDependencies` у пакета не подтверждает совместимость с любой
версией React. Интеграция с нашим приложением проверена через MCP-сервер.

## Подключение к нашему Vite-приложению

Интеграция уже настроена. После установки зависимостей запустите
`pnpm --dir frontend dev` и откройте напечатанный адрес через Chrome DevTools MCP.
После обновления `.codex/config.toml` перезапустите сессию Codex, чтобы появились
`list_3p_developer_tools` и `execute_3p_developer_tool`.
Ниже описаны установленные зависимости и порядок загрузки.

### 1. Установить библиотеку

Пакет закреплён в `frontend/package.json` как devDependency. На новой машине
используйте обычную установку зависимостей по [frontend README](../../frontend/README.md).
Команда первоначального добавления пакета из корня репозитория:

```bash
pnpm --dir frontend add --save-dev --save-exact react-devtools-cdt-mcp@0.1.0
```

### 2. Загрузить инструменты раньше React

Хук DevTools должен установиться до инициализации React. Вход
[`frontend/src/bootstrap.ts`](../../frontend/src/bootstrap.ts) использует top-level
`await` без статических импортов React и компонентов:

```ts
if (import.meta.env.DEV) {
  await import("react-devtools-cdt-mcp/register");
}

await import("./main");
```

В `frontend/index.html` указан этот вход:

```html
<script type="module" src="/src/bootstrap.ts"></script>
```

Содержимое `src/main.tsx`, включая порядок CSS-импортов, остаётся точкой
монтирования приложения. Ожидание первого импорта гарантирует порядок загрузки.
Просто поставить `import()` без `await` перед статическим импортом `main` или
`react-dom` недостаточно: статические зависимости выполнятся раньше тела модуля.

У опубликованной версии `0.1.0` нет TypeScript-деклараций. Для этого импорта
в проекте добавлен `frontend/src/react-devtools-cdt-mcp.d.ts`:

```ts
declare module "react-devtools-cdt-mcp/register";
```

Это декларация только побочного импорта. Для вызовов API из корня пакета
понадобятся отдельные типы.

Bootstrap сочетает
[требование React к порядку загрузки](https://react.dev/reference/dev-tools/react-devtools-cdt-mcp#setup)
и [удаление ветки `import.meta.env.DEV` в production через Vite](https://vite.dev/guide/env-and-mode).
При изменении загрузки следует проверять отсутствие регистрации в production.

### 3. Разрешить сторонние инструменты в MCP

В массив `args` секции `[mcp_servers.chrome-devtools]` файла
[`.codex/config.toml`](../../.codex/config.toml) добавлен флаг:

```toml
  "--categoryExperimentalThirdParty=true",
```

Сохранены закреплённая версия сервера, настройки Chrome, изолированного профиля
и отключённой статистики. Перезапустить сессию Codex после изменения конфигурации.
Флаг по умолчанию выключен; см. [конфигурацию Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/configuration.md).

### 4. Проверить подключение

1. Подготовить зависимости и backend по [frontend README](../../frontend/README.md).
2. Запустить `pnpm --dir frontend dev` и открыть через Chrome DevTools MCP адрес,
   напечатанный Vite. Для данных приложения нужен работающий backend и PostgreSQL.
   Дождаться появления интерфейса через `wait_for`: обнаружение инструментов может
   завершиться до первого монтирования React.
3. Вызвать `list_3p_developer_tools`: ожидается группа `react` с 12 инструментами.
4. Через `execute_3p_developer_tool` вызвать `react_find_components` с именем `App`,
   затем запросить найденный компонент по его React UID.
5. Запустить проверки:

```bash
pnpm --dir frontend check
pnpm --dir frontend test:smoke
```

`test:smoke` собирает production и проверяет приложение с настоящим backend и БД.
Браузер Chromium должен быть установлен заранее. Для проверки MCP в development
используйте вызовы из шагов 3–4. В production отдельно проверьте отсутствие
группы `react` и регистрации DevTools в собранных JS-чанках.

### Проверка MCP-транспорта 6 ноября 2026 года

Через отдельный stdio-клиент запущен MCP-сервер из `.codex/config.toml`
с дополнительным `--headless` для проверки. Приложение использовало отдельные
Vite, Go-backend и PostgreSQL, после проверки окружение удалено.

Успешно вызваны все 12 React-инструментов через `execute_3p_developer_tool`:
прочитаны дерево, props и Hooks формы, исходник, parent/owner stack и стек JSX;
DOM UID поля преобразован в React host-компонент. После ввода проверено новое
значение Hook, после создания типа события — запись через HTTP API и
`revision: 1` в props `EventCatalog`. Записан профиль взаимодействия,
получены сводка и отчёт коммита. Также проверены линтеры, сборка и production
smoke-тесты. В production JS-чанках нет регистрации или определений
инструментов `react-devtools-cdt-mcp`.

## Как вызывать инструменты

`react_*` — имена инструментов страницы. Для их вызова используется MCP-инструмент
`execute_3p_developer_tool`. Его поле `params` содержит **JSON-строку**:

```json
{
  "toolName": "react_find_components",
  "params": "{\"name\":\"App\"}"
}
```

Затем подставить UID из `results`, например `r5`:

```json
{
  "toolName": "react_get_component_by_uid",
  "params": "{\"uid\":\"r5\",\"includeHooks\":true}"
}
```

Если схема MCP требует `pageId`, добавить ID нужной страницы из `list_pages`.
При работе через выбранную страницу сначала выбрать её через `select_page`.
Сверять параметры с инструментами запущенной версии сервера; см.
[справочник Chrome](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md#third-party).

Другой способ — передать в `evaluate_script` функцию, исполняемую на странице:

```js
async () => {
  return await window.__dtmcp.executeTool("react_find_components", { name: "App" });
};
```

Здесь параметры уже являются JavaScript-объектом. `window.__dtmcp` предоставляет
Chrome DevTools MCP после обнаружения инструментов; для обычной консоли без MCP
этот объект не предполагается.

## Справочник инструментов

`?` означает необязательный параметр. Ниже схемы инструментов страницы, то есть
содержимого `params` после разбора JSON. Они сверены с
[определениями React](https://github.com/react/react/blob/main/packages/react-devtools-cdt-mcp/src/DevToolsCdtMcp.js).

| Инструмент | Параметры | Результат и применение |
| --- | --- | --- |
| `react_get_component_tree` | `depth?: number = 20`, `rootUid?: string` | `{nodes}`: плоское дерево; связи через `firstChild` и `nextSibling` |
| `react_find_components` | `name: string`, `rootUid?: string`, `page?: number = 1`, `pageSize?: number = 10` | Поиск подстроки имени без учёта регистра; `results`, `totalCount`, `totalPages`, `page`, `pageSize` |
| `react_get_component_by_uid` | `uid: string`, `includeHooks?: boolean = false` | `uid`, `type`, `name`, опциональные `key`, `props`, `hooks`; props без `children` |
| `react_get_component_by_dom_element` | `element: object` | Информация о host-компоненте DOM-узла; Hooks в результате нет |
| `react_get_component_source` | `uid: string` | `{source: {name, fileName, line, column}}` либо `{source: null}` |
| `react_get_parent_stack` | `uid: string` | Массив `{uid, name, type}` от ближайшего родителя к корню дерева |
| `react_get_owner_stack` | `uid: string` | Массив `{uid, name, type}` от ближайшего JSX-владельца к корневому; DEV-only |
| `react_get_owner_stack_trace` | `uid: string` | `{stack}` со строкой стека мест создания JSX; DEV-only |
| `react_start_profiling` | `traceName?: string` | `{status: "started", traceName}`; имя генерируется, если не задано |
| `react_stop_profiling` | `{}` | `{status: "stopped", traceName, commits}`; `commits` — количество коммитов |
| `react_get_trace_overview` | `traceName: string` | Массив сводок: `commit`, `committedAt`, `renderDuration`, `layoutDuration`, `passiveDuration`, `componentsChanged` |
| `react_get_commit_report` | `traceName: string`, `commitIndex: number` | Данные одного коммита и `components` с `actualDuration`, `selfDuration`; сортировка по убыванию `actualDuration` |

React UID вида `r5` сохраняется при повторном рендере, но после перезагрузки
страницы его нужно получить заново. UID элемента из DOM-снимка Chrome — другой
идентификатор: для DOM-инструмента MCP принимает `element: {uid: "…"}` и сам
преобразует его в ссылку на элемент страницы. При прямом вызове через
`window.__dtmcp.executeTool` нужно передавать настоящий DOM-элемент.

Host-компонент — например, `button` или `div`. Чтобы перейти от него к компоненту
приложения, использовать parent/owner stack. Parent показывает положение в
смонтированном дереве, owner — кто создал элемент в JSX.

## Примеры отладки

### Найти состояние компонента

Вызвать `react_find_components` для `App` или имени нужного компонента,
взять UID, вызвать `react_get_component_by_uid` с `includeHooks: true`.
При необходимости запросить `react_get_component_source` и owner stack.
Массив Hooks содержит вложенные `subHooks` для пользовательских хуков.
Чтение Hooks повторно исполняет render-функцию компонента, эффекты не запускаются.
См. [контракт инспекции](https://github.com/react/react/blob/main/packages/react-devtools-cdt-mcp/README.md#react_get_component_by_uid).

### Разобрать медленное действие

Последовательно выполнить инструменты страницы:

```text
react_start_profiling     {"traceName":"admin-interaction"}
                         → воспроизвести действие на /admin
react_stop_profiling      {}
react_get_trace_overview  {"traceName":"admin-interaction"}
react_get_commit_report   {"traceName":"admin-interaction","commitIndex":0}
```

Выбрать интересующий коммит из overview; нумерация `commitIndex` начинается с нуля.
Длительности указаны в миллисекундах; `null` означает отсутствие измерений
в используемой сборке. Этот отчёт описывает React-рендеры; для сети и работы
браузера дополнительно использовать инструменты Chrome.

## Программный API

Корень пакета экспортирует `register(target?)` и `buildToolGroup(tools)`.
`register()` устанавливает хук и обработчик обнаружения, возвращает
`{facade, unregister}`; `target` по умолчанию равен `globalThis`.
Повторная регистрация того же target возвращает существующую регистрацию.
`buildToolGroup` собирает группу из инструментов facade и нужен для собственной
интеграции. См. [реализацию API](https://github.com/react/react/blob/main/packages/react-devtools-cdt-mcp/src/DevToolsCdtMcp.js).

`unregister()` удаляет обработчик обнаружения. Его не следует считать полным
демонтажем установленного хука React DevTools.

## Ограничения и устранение проблем

| Симптом | Что проверить |
| --- | --- |
| В MCP нет `list_3p_developer_tools` | Флаг сторонних инструментов, версию сервера, перезапуск MCP-сессии |
| Список есть, группы `react` нет | Правильную страницу и загрузку `register`; повторить обнаружение |
| Группа есть, дерево пустое | Дождаться UI через `wait_for`; проверить загрузку DevTools до React и полностью перезагрузить страницу |
| Ошибка про browser-like environment | `register` импортирован в SSR или Node-тесте; перенести импорт в браузерный вход |
| Неизвестный UID | После перезагрузки заново выполнить поиск или запрос дерева |
| DOM-узел не управляется React | Выбрать элемент внутри смонтированного React-приложения |
| Нет исходников или owner stack | Использовать dev-сервер; для host-узла source может быть `null` |
| Ошибка разбора `params` | Передать JSON-строку в MCP-вызов; объект используется внутри `executeTool` на странице |

Регистрация DevTools добавляет работу на каждом коммите React, поэтому её следует
включать только в development. Инструменты открывают агенту props и значения
Hooks: использовать доверенную локальную отладочную сессию и подходящие тестовые
данные. См. [ограничения React](https://react.dev/reference/dev-tools/react-devtools-cdt-mcp#troubleshooting)
и [README пакета](https://github.com/react/react/blob/main/packages/react-devtools-cdt-mcp/README.md).
