//go:build !unit

package integration_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/bkoshelev/go-project-386/backend/internal/database/migrations"
)

var pool *pgxpool.Pool

func TestMain(m *testing.M) {
	os.Exit(runTests(m))
}

func runTests(m *testing.M) (code int) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	container, err := postgres.Run(ctx, "postgres:18.6-alpine",
		postgres.WithDatabase("backend_test"),
		postgres.WithUsername("backend_test"),
		postgres.WithPassword("backend_test"),
		postgres.BasicWaitStrategies(),
	)
	// Run can return a partially created container alongside an error.
	if container != nil {
		defer func() {
			cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cleanupCancel()
			if err := container.Terminate(cleanupCtx); err != nil {
				fmt.Fprintln(os.Stderr, "terminate PostgreSQL:", err)
				code = 1
			}
		}()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "start PostgreSQL (Docker is required):", err)
		return 1
	}
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		fmt.Fprintln(os.Stderr, "PostgreSQL connection string:", err)
		return 1
	}
	pool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "create PostgreSQL pool:", err)
		return 1
	}
	defer pool.Close()

	sqlDB := stdlib.OpenDBFromPool(pool)
	defer func() {
		if err := sqlDB.Close(); err != nil {
			fmt.Fprintln(os.Stderr, "close migration connections:", err)
			code = 1
		}
	}()
	provider, err := migrations.New(sqlDB)
	if err != nil {
		fmt.Fprintln(os.Stderr, "create migrations:", err)
		return 1
	}
	if _, err := provider.Up(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "apply test schema:", err)
		return 1
	}
	return m.Run()
}
