# Все пути вычисляются от расположения Makefile, поэтому цели можно вызывать из любого каталога.
ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
# Go-модуль backend остаётся изолированным от frontend.
BACKEND_DIR := $(ROOT_DIR)/backend
# Закреплённые бинарники проекта не зависят от содержимого глобального PATH.
TOOLS_DIR := $(BACKEND_DIR)/bin/tools
# Команда Go задаётся явно при необходимости, но всегда проверяется на точную целевую версию.
GO ?= go
# Дочерние процессы анализаторов используют тот же проверенный Go, а не другой бинарник из PATH.
GO_BIN_DIR := $(shell $(GO) env GOROOT 2>/dev/null)/bin
# Целевая версия приложения едина для установки инструментов и всех проверок.
GO_VERSION := 1.26.8
# Версия агрегатора закреплена для воспроизводимого набора анализаторов и схемы конфигурации.
GOLANGCI_LINT_VERSION := 2.13.2
# Версия сканера уязвимостей закреплена независимо от зависимостей приложения.
GOVULNCHECK_VERSION := 1.8.0
# Автоматическая загрузка другого Go toolchain запрещена: команды должны работать на проверенной версии.
export GOTOOLCHAIN := local
# Golangci-lint и govulncheck вызывают go как дочерний процесс, поэтому ставим целевой toolchain первым.
export PATH := $(GO_BIN_DIR):$(PATH)

# Эти абсолютные пути гарантируют использование установленных проектом версий инструментов.
GOLANGCI_LINT := $(TOOLS_DIR)/golangci-lint
GOVULNCHECK := $(TOOLS_DIR)/govulncheck

# Все цели служебные: одноимённые файлы не должны мешать выполнению проверок.
.PHONY: tools lint fmt lint-fix vuln vet test build check check-go-version check-golangci-lint check-govulncheck

# tools устанавливает закреплённые инструменты локально после проверки платформы и SHA-256 архива.
tools: check-go-version
	@set -eu; \
	os="$$(uname -s | tr '[:upper:]' '[:lower:]')"; \
	arch="$$(uname -m)"; \
	case "$$arch" in x86_64|amd64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) echo "Unsupported architecture: $$arch" >&2; exit 1 ;; esac; \
	case "$$os/$$arch" in \
		darwin/amd64) checksum=8a13aaf9cbbb1dee52824e862cf0d0720e5bb97c1f4260d1e51623a09492b57b ;; \
		darwin/arm64) checksum=f4bf83f0b64f055c42b28fc9a38861839f69c096e61c788e72dfaae412011789 ;; \
		linux/amd64) checksum=2277d43b98ec0054280f2ac26b53268bae97682444678a59a657dd565da021d6 ;; \
		linux/arm64) checksum=a2a4e0065aa41be71f7c5ac90f271b61751331e5d04314e62afe4027855f0893 ;; \
		*) echo "Unsupported platform: $$os/$$arch (use Linux under WSL on Windows)" >&2; exit 1 ;; \
	esac; \
	tmp_dir="$$(mktemp -d "$${TMPDIR:-/tmp}/backend-tools.XXXXXX")"; \
	trap 'rm -rf "$$tmp_dir"' EXIT HUP INT TERM; \
	archive="golangci-lint-$(GOLANGCI_LINT_VERSION)-$$os-$$arch.tar.gz"; \
	url="https://github.com/golangci/golangci-lint/releases/download/v$(GOLANGCI_LINT_VERSION)/$$archive"; \
	echo "Downloading golangci-lint v$(GOLANGCI_LINT_VERSION) for $$os/$$arch"; \
	curl -fsSL "$$url" -o "$$tmp_dir/$$archive"; \
	if command -v sha256sum >/dev/null 2>&1; then actual="$$(sha256sum "$$tmp_dir/$$archive" | awk '{print $$1}')"; \
	elif command -v shasum >/dev/null 2>&1; then actual="$$(shasum -a 256 "$$tmp_dir/$$archive" | awk '{print $$1}')"; \
	else echo "sha256sum or shasum is required" >&2; exit 1; fi; \
	if [ "$$actual" != "$$checksum" ]; then echo "SHA-256 mismatch for $$archive" >&2; exit 1; fi; \
	tar -xzf "$$tmp_dir/$$archive" -C "$$tmp_dir"; \
	mkdir "$$tmp_dir/bin"; \
	cp "$$tmp_dir/golangci-lint-$(GOLANGCI_LINT_VERSION)-$$os-$$arch/golangci-lint" "$$tmp_dir/bin/golangci-lint"; \
	chmod 0755 "$$tmp_dir/bin/golangci-lint"; \
	echo "Building govulncheck v$(GOVULNCHECK_VERSION) with Go $(GO_VERSION)"; \
	GOBIN="$$tmp_dir/bin" $(GO) install golang.org/x/vuln/cmd/govulncheck@v$(GOVULNCHECK_VERSION); \
	"$$tmp_dir/bin/golangci-lint" version | grep -F "version $(GOLANGCI_LINT_VERSION)" >/dev/null; \
	"$$tmp_dir/bin/govulncheck" -version | grep -F "govulncheck@v$(GOVULNCHECK_VERSION)" >/dev/null; \
	mkdir -p "$(TOOLS_DIR)"; \
	mv -f "$$tmp_dir/bin/golangci-lint" "$(GOLANGCI_LINT)"; \
	mv -f "$$tmp_dir/bin/govulncheck" "$(GOVULNCHECK)"; \
	echo "Installed backend tools in $(TOOLS_DIR)"

# lint проверяет схему, форматирование, импорты и выбранные линтеры, не изменяя файлы.
lint: check-go-version check-golangci-lint
	@cd "$(BACKEND_DIR)" && "$(GOLANGCI_LINT)" config verify
	@set -eu; \
	diff_file="$$(mktemp "$${TMPDIR:-/tmp}/backend-format.XXXXXX")"; \
	trap 'rm -f "$$diff_file"' EXIT HUP INT TERM; \
	cd "$(BACKEND_DIR)"; \
	fmt_status=0; "$(GOLANGCI_LINT)" fmt --diff >"$$diff_file" || fmt_status=$$?; \
	if [ -s "$$diff_file" ]; then cat "$$diff_file"; echo "Formatting differs; run make fmt" >&2; exit 1; fi; \
	if [ "$$fmt_status" -ne 0 ]; then echo "Formatter check failed" >&2; exit "$$fmt_status"; fi
	@cd "$(BACKEND_DIR)" && "$(GOLANGCI_LINT)" run

# fmt применяет к backend канонические gofmt и goimports из общей конфигурации.
fmt: check-go-version check-golangci-lint
	@cd "$(BACKEND_DIR)" && "$(GOLANGCI_LINT)" fmt

# lint-fix применяет доступные исправления линтеров и показывает diff для обязательного просмотра.
lint-fix: check-go-version check-golangci-lint
	@cd "$(BACKEND_DIR)" && "$(GOLANGCI_LINT)" run --fix
	@git -C "$(ROOT_DIR)" diff -- backend

# vuln запускает стандартный анализ вызываемых уязвимостей для всех пакетов backend.
vuln: check-go-version check-govulncheck
	@cd "$(BACKEND_DIR)" && "$(GOVULNCHECK)" ./...

# vet сохраняет отдельную стандартную проверку Go без дублирования govet в агрегаторе.
vet: check-go-version
	@cd "$(BACKEND_DIR)" && $(GO) vet ./...

# test запускает все backend-тесты с детектором гонок.
test: check-go-version
	@cd "$(BACKEND_DIR)" && $(GO) test -race ./...

# build проверяет сборку всех backend-пакетов без создания артефакта в репозитории.
build: check-go-version
	@cd "$(BACKEND_DIR)" && $(GO) build ./...

# check последовательно объединяет все обязательные проверки только для backend.
check:
	@$(MAKE) --no-print-directory lint
	@$(MAKE) --no-print-directory vet
	@$(MAKE) --no-print-directory test
	@$(MAKE) --no-print-directory build
	@$(MAKE) --no-print-directory vuln

# check-go-version запрещает запуск проверок и установки на отличающемся Go toolchain.
check-go-version:
	@actual="$$($(GO) version 2>/dev/null | awk '{print $$3}')"; \
	if [ "$$actual" != "go$(GO_VERSION)" ]; then \
		echo "Go $(GO_VERSION) is required (found $${actual:-none}); install it and ensure it is selected" >&2; \
		exit 1; \
	fi

# check-golangci-lint проверяет локальный бинарник и предлагает явную установку вместо автозагрузки.
check-golangci-lint:
	@if [ ! -x "$(GOLANGCI_LINT)" ] || ! "$(GOLANGCI_LINT)" version 2>/dev/null | grep -F "version $(GOLANGCI_LINT_VERSION)" >/dev/null; then \
		echo "golangci-lint v$(GOLANGCI_LINT_VERSION) is required; run 'make tools'" >&2; \
		exit 1; \
	fi

# check-govulncheck проверяет локальный сканер и предлагает явную установку вместо автозагрузки.
check-govulncheck:
	@if [ ! -x "$(GOVULNCHECK)" ] || ! "$(GOVULNCHECK)" -version 2>/dev/null | grep -F "govulncheck@v$(GOVULNCHECK_VERSION)" >/dev/null; then \
		echo "govulncheck v$(GOVULNCHECK_VERSION) is required; run 'make tools'" >&2; \
		exit 1; \
	fi
