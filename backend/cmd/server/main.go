package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"github.com/bkoshelev/go-project-386/backend/internal/config"
	"github.com/bkoshelev/go-project-386/backend/internal/httpserver"
	"github.com/bkoshelev/go-project-386/backend/internal/server"
)

func main() {
	os.Exit(run())
}

func run() int {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := config.Load()
	if err != nil {
		logger.Error("load configuration", slog.Any("error", err))
		return 1
	}

	router, err := httpserver.NewRouter(logger, gin.ReleaseMode)
	if err != nil {
		logger.Error("create HTTP router", slog.Any("error", err))
		return 1
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := server.New(cfg.HTTPAddr, router, logger).Run(ctx); err != nil {
		logger.Error("HTTP server failed", slog.Any("error", err))
		return 1
	}

	return 0
}
