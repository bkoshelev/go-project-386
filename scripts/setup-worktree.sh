#!/usr/bin/env bash
# Включаем остановку при ошибках и необъявленных переменных, а также контроль ошибок в конвейерах.
set -Eeuo pipefail

# Задаём начальный этап для сообщений об ошибках.
stage="checking environment"
# При ошибке сохраняем код возврата, выводим этап и номер строки и завершаем скрипт с тем же кодом.
trap 'status=$?; printf "[setup] Failed while %s (line %s, exit %s)\n" "$stage" "$LINENO" "$status" >&2; exit "$status"' ERR

# Определяем функцию для вывода информационных сообщений.
log() {
  # Добавляем к сообщению префикс настройки рабочего дерева.
  printf '[setup] %s\n' "$*"
}

# Определяем функцию для завершения настройки с ошибкой.
fail() {
  # Выводим причину сбоя в стандартный поток ошибок.
  printf '[setup] %s\n' "$*" >&2
  # Завершаем скрипт с кодом ошибки.
  exit 1
}

# Определяем функцию проверки доступности команды.
require_command() {
  # Ищем команду в PATH и завершаем настройку, если она недоступна.
  command -v "$1" >/dev/null 2>&1 || fail "Required command is missing from PATH: $1"
}

# Проверяем, что Orca передала путь к новому рабочему дереву.
[[ -n "${ORCA_WORKTREE_PATH:-}" ]] || fail "ORCA_WORKTREE_PATH must point to the new worktree"
# Проверяем существование каталога рабочего дерева.
[[ -d "$ORCA_WORKTREE_PATH" ]] || fail "Worktree directory does not exist: $ORCA_WORKTREE_PATH"
# Переходим в корень нового рабочего дерева.
cd "$ORCA_WORKTREE_PATH"

# Разрешаем только значения 0 и 1 для флага дополнительных проверок.
case "${SETUP_VERIFY:-0}" in
  0|1) ;;
  *) fail "SETUP_VERIFY must be 0 or 1" ;;
esac

# Перебираем файлы, необходимые для настройки проекта.
for file in Makefile backend/go.mod backend/go.sum api/package.json api/pnpm-lock.yaml frontend/.nvmrc frontend/package.json frontend/pnpm-lock.yaml; do
  # Останавливаем настройку, если обязательный файл отсутствует.
  [[ -f "$file" ]] || fail "Required project file is missing: $file"
done

# Перебираем системные утилиты, необходимые для настройки.
for tool in make curl tar awk tr uname; do
  # Проверяем доступность очередной утилиты.
  require_command "$tool"
done

# Orca может унаследовать устаревший PATH: выбираем уже установленные закреплённые версии
# без загрузки настроек интерактивной оболочки и скачивания другого набора инструментов Go.
# Запрещаем Go автоматически выбирать и скачивать другую версию набора инструментов.
export GOTOOLCHAIN=local
# Читаем требуемую версию Go из описания серверного модуля.
expected_go="$(awk '$1 == "go" { print $2; exit }' backend/go.mod)"
# Если GO не задана, проверяем наличие нужной версии Go в каталоге SDK пользователя.
if [[ -z "${GO:-}" && -x "$HOME/sdk/go$expected_go/bin/go" ]]; then
  # Выбираем найденный исполняемый файл Go.
  GO="$HOME/sdk/go$expected_go/bin/go"
fi
# Передаём выбранную команду Go дочерним процессам; по умолчанию используем go из PATH.
export GO="${GO:-go}"

# Читаем требуемую версию Node.js, удаляя пробельные символы.
expected_node="$(tr -d '[:space:]' < frontend/.nvmrc)"
# Формируем путь к каталогу нужной версии Node.js, установленной через nvm.
node_bin="${NVM_DIR:-$HOME/.nvm}/versions/node/v$expected_node/bin"
# Проверяем, установлена ли нужная версия Node.js через nvm.
if [[ -x "$node_bin/node" ]]; then
  # Даём выбранной версии Node.js приоритет при поиске команд.
  export PATH="$node_bin:$PATH"
fi
# Перебираем выбранный Go и команды клиентского окружения.
for tool in "$GO" node pnpm; do
  # Проверяем доступность очередного инструмента.
  require_command "$tool"
done

# Проверяем наличие хотя бы одной утилиты для вычисления контрольных сумм SHA-256.
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  # Останавливаем настройку, если проверка загружаемых серверных инструментов невозможна.
  fail "sha256sum or shasum is required to verify backend tool downloads"
fi

# Определяем операционную систему и архитектуру процессора.
platform="$(uname -s)/$(uname -m)"
# Продолжаем настройку только на поддерживаемых сочетаниях системы и архитектуры.
case "$platform" in
  Darwin/arm64|Darwin/x86_64|Linux/amd64|Linux/x86_64|Linux/arm64|Linux/aarch64) ;;
  *) fail "Unsupported platform: $platform (use macOS, Linux or WSL on amd64/arm64)" ;;
esac

# Выводим имя подготавливаемого рабочего пространства.
log "Preparing workspace: ${ORCA_WORKSPACE_NAME:-unnamed}"
# Проверяем соответствие выбранной версии Go требованиям проекта.
make --no-print-directory GO="$GO" check-go-version

# Получаем фактическую версию Node.js.
actual_node="$(node --version)"
# Проверяем точное совпадение версии Node.js с закреплённой в проекте.
[[ "$actual_node" == "v$expected_node" ]] || fail "Node.js $expected_node is required (found $actual_node); select it before running setup"

# Читаем требуемую версию pnpm из конфигурации клиентского приложения.
expected_pnpm="$(node -p "require('./frontend/package.json').packageManager.replace(/^pnpm@/, '')")"
# Получаем фактическую версию pnpm.
actual_pnpm="$(pnpm --version)"
# Проверяем точное совпадение версии pnpm с закреплённой в проекте.
[[ "$actual_pnpm" == "$expected_pnpm" ]] || fail "pnpm $expected_pnpm is required (found $actual_pnpm); select it before running setup"
# Выводим версии инструментов, выбранных для настройки.
log "Using Go $expected_go, Node.js $expected_node and pnpm $actual_pnpm"

# Проверяем, что cgo включён: серверные тесты с флагом -race требуют cgo и компилятор C.
[[ "$("$GO" env CGO_ENABLED)" == "1" ]] || fail "Backend race tests require CGO_ENABLED=1 and a C compiler"
# Разбираем настроенную в Go команду компилятора C на имя программы и аргументы.
read -r -a compiler <<< "$("$GO" env CC)"
# Проверяем, что команда компилятора C задана.
[[ "${#compiler[@]}" -gt 0 ]] || fail "Go has no C compiler configured; set CC"
# Проверяем доступность исполняемого файла компилятора C.
require_command "${compiler[0]}"

# Устанавливаем текущий этап загрузки серверных зависимостей для диагностики ошибок.
stage="downloading backend dependencies"
# Сообщаем о начале этапа.
log "$stage"
# Выполняем загрузку в отдельной оболочке, сохраняя текущий каталог основного скрипта.
(
  # Переходим в каталог серверного модуля.
  cd backend
  # Загружаем зависимости Go, указанные в модуле.
  "$GO" mod download
)

# Устанавливаем текущий этап установки серверных инструментов для диагностики ошибок.
stage="installing backend tools"
# Проверяем, совпадают ли установленные версии инструментов с закреплёнными в Makefile.
if make --no-print-directory GO="$GO" check-golangci-lint check-govulncheck check-sqlc >/dev/null 2>&1; then
  # Сообщаем, что подходящие версии инструментов уже установлены.
  log "Backend tools already match the pinned versions"
else
  # Сообщаем о начале установки серверных инструментов.
  log "$stage"
  # Устанавливаем закреплённые версии golangci-lint, govulncheck и sqlc.
  make --no-print-directory GO="$GO" tools
fi

# Устанавливаем текущий этап установки инструментов API для диагностики ошибок.
stage="installing API tooling"
# Сообщаем о начале этапа.
log "$stage"
# Устанавливаем все зависимости API, включая зависимости разработки, строго по lock-файлу.
pnpm --dir api install --frozen-lockfile --prod=false

# Устанавливаем текущий этап установки клиентских зависимостей для диагностики ошибок.
stage="installing frontend dependencies"
# Сообщаем о начале этапа.
log "$stage"
# Выполняем установку в отдельной оболочке, сохраняя текущий каталог основного скрипта.
(
  # Переходим в каталог клиентского приложения.
  cd frontend
  # Устанавливаем все клиентские зависимости, включая зависимости разработки, по lock-файлу.
  pnpm install --frozen-lockfile --prod=false
)

# Устанавливаем текущий этап генерации API-клиента для диагностики ошибок.
stage="generating API client"
# Сообщаем о начале этапа.
log "$stage"
# Компилируем контракт TypeSpec и генерируем клиент API для приложения.
pnpm --dir frontend api:generate

# Устанавливаем текущий этап установки браузера для диагностики ошибок.
stage="installing Playwright Chromium"
# Сообщаем о начале этапа.
log "$stage"
# Выполняем установку в отдельной оболочке, сохраняя текущий каталог основного скрипта.
(
  # Переходим в каталог клиентского приложения.
  cd frontend
  # Устанавливаем Chromium для браузерных тестов Playwright.
  pnpm exec playwright install chromium
)

# Запускаем дополнительные проверки проекта, если включён флаг SETUP_VERIFY.
if [[ "${SETUP_VERIFY:-0}" == "1" ]]; then
  # Устанавливаем текущий этап проверки сервера для диагностики ошибок.
  stage="verifying backend"
  # Сообщаем о начале этапа.
  log "$stage"
  # Запускаем серверные проверки: линтер, vet, тесты с -race, сборку и поиск уязвимостей.
  make --no-print-directory GO="$GO" check

  # Устанавливаем текущий этап проверки клиента для диагностики ошибок.
  stage="verifying frontend"
  # Сообщаем о начале этапа.
  log "$stage"
  # Выполняем проверки в отдельной оболочке, сохраняя текущий каталог основного скрипта.
  (
    # Переходим в каталог клиентского приложения.
    cd frontend
    # Проверяем клиентский код линтерами и проверкой форматирования.
    pnpm check
    # Собираем клиент и запускаем дымовые тесты в Chromium.
    pnpm test:smoke
  )
fi

# Сообщаем об успешном завершении настройки рабочего пространства.
log "Workspace setup complete"
