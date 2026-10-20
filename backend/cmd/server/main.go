package main

import (
	"context"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/gin-gonic/gin"

	"github.com/bkoshelev/go-project-386/backend/internal/config"
	"github.com/bkoshelev/go-project-386/backend/internal/database"
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

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Prepare(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("prepare database", slog.Any("error", err))
		return 1
	}
	defer func() {
		if err := db.Close(); err != nil {
			logger.Error("close database connections")
		}
	}()

	// The image uses /app as its working directory. Direct backend development
	// can run without a frontend build and continues to serve only the HTTP API.
	var assets fs.FS
	if _, err := os.Stat("frontend/index.html"); err == nil {
		assets = os.DirFS("frontend")
	}
	router, err := httpserver.NewRouter(logger, gin.ReleaseMode, httpserver.Options{
		Readiness: db.PingContext,
		Frontend:  assets,
	})
	if err != nil {
		logger.Error("create HTTP router", slog.Any("error", err))
		return 1
	}

	if err := server.New(cfg.HTTPAddr, router, logger).Run(ctx); err != nil {
		logger.Error("HTTP server failed", slog.Any("error", err))
		return 1
	}

	return 0
}
