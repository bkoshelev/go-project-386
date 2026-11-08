# syntax=docker/dockerfile:1
# Первая строка выбирает синтаксис Dockerfile версии 1 для BuildKit.
# Создаём общую стадию сборки на минимальном Debian Bookworm.
FROM debian:bookworm-slim AS build-base
# Обновляем список пакетов и устанавливаем сертификаты, загрузчик, Git и распаковщик xz.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
# Удаляем списки пакетов после успешной установки, уменьшая размер слоя.
    && rm -rf /var/lib/apt/lists/*
# Загружаем официальный установщик mise во временный файл.
RUN curl -fsSL https://mise.run -o /tmp/install-mise \
# Устанавливаем закреплённую версию mise в общий PATH образа.
    && MISE_VERSION=2026.10.17 MISE_INSTALL_PATH=/usr/local/bin/mise sh /tmp/install-mise \
# Удаляем временный установщик после успешной установки.
    && rm /tmp/install-mise
# Отключаем hooks, разрешаем автоматические подтверждения mise и доверяем конфигурации в /src.
ENV MISE_NO_HOOKS=1 MISE_YES=1 MISE_TRUSTED_CONFIG_PATHS=/src
# Задаём корень исходников рабочим каталогом следующих инструкций.
WORKDIR /src
# Копируем конфигурацию инструментов и lock-файл с версиями и метаданными загрузок.
COPY mise.toml mise.lock ./
# Копируем файловые задачи, вызываемые при сборке.
COPY mise-tasks ./mise-tasks
# Копируем описание Go-модуля и контрольные суммы для кэширования загрузки зависимостей.
COPY backend/go.mod backend/go.sum ./backend/
# Копируем декларации версий и зависимостей frontend до остальных исходников.
COPY frontend/.nvmrc frontend/package.json ./frontend/

# Создаём стадию сборки frontend на основе общей стадии.
FROM build-base AS frontend
# Устанавливаем Node.js и pnpm из конфигурации, требуя URL загрузок из lock-файла.
RUN mise install --locked node pnpm
# Копируем манифест и lock-файл инструментов контракта API.
COPY api/package.json api/pnpm-lock.yaml ./api/
# Копируем lock-файл зависимостей frontend.
COPY frontend/pnpm-lock.yaml ./frontend/
# Устанавливаем зависимости API и frontend через общие задачи mise.
RUN mise run api:deps && mise run frontend:deps
# Копируем исходники контракта API и настройки генераторов.
COPY api ./api
# Копируем исходники и конфигурацию frontend.
COPY frontend ./frontend
# Генерируем API-клиент, проверяем TypeScript и собираем frontend для production.
RUN mise run frontend:build

# Создаём отдельную стадию сборки backend на основе общей стадии.
FROM build-base AS backend
# Запрещаем смену Go toolchain и отключаем cgo для статических production-бинарников.
ENV GOTOOLCHAIN=local CGO_ENABLED=0
# Устанавливаем Go по lock-файлу и загружаем зависимости серверного модуля.
RUN mise install --locked go && mise run backend:deps
# Копируем исходники backend после загрузки зависимостей для сохранения кэша.
COPY backend ./backend
# Собираем исполняемые файлы сервера и утилиты миграций через общую задачу mise.
RUN mise run backend:dist

# Создаём итоговый минимальный образ без оболочки с непривилегированным пользователем.
FROM gcr.io/distroless/static-debian12:nonroot
# Задаём рабочий каталог production-приложения.
WORKDIR /app
# Копируем собранные статические ресурсы frontend в итоговый образ.
COPY --from=frontend /src/frontend/dist ./frontend
# Копируем сервер и утилиту миграций из стадии сборки backend.
COPY --from=backend /src/backend/bin/server /src/backend/bin/migrate /app/
# Задаём порт HTTP-сервера и production-режим Gin по умолчанию.
ENV PORT=8080 GIN_MODE=release
# Объявляем используемый приложением порт внутри контейнера.
EXPOSE 8080
# Запускаем сервер при старте контейнера.
CMD ["/app/server"]
