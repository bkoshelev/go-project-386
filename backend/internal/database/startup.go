// Package database prepares the external PostgreSQL database before HTTP startup.
package database

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/bkoshelev/go-project-386/backend/internal/database/migrations"
)

// StartupTimeout bounds connection retries, migration locking and migration execution together.
const StartupTimeout = 5 * time.Minute

// Prepare connects and migrates within one budget. The caller must close a successful result.
// A shorter parent deadline also applies. Returned errors never include connection credentials.
func Prepare(ctx context.Context, dsn string) (*sql.DB, error) {
	ctx, cancel := context.WithTimeout(ctx, StartupTimeout)
	defer cancel()
	config, err := pgx.ParseConfig(dsn)
	if strings.TrimSpace(dsn) == "" || err != nil {
		return nil, errors.New("DATABASE_URL must be a valid PostgreSQL connection string")
	}
	// Each attempt must leave time for retries within the overall budget.
	if config.ConnectTimeout == 0 || config.ConnectTimeout > 2*time.Second {
		config.ConnectTimeout = 2 * time.Second
	}
	db := stdlib.OpenDB(*config)
	if err := waitForDatabase(ctx, db); err != nil {
		return nil, errors.Join(err, db.Close())
	}
	provider, err := migrations.New(db)
	if err == nil {
		_, err = provider.Up(ctx)
	}
	if err != nil {
		return nil, errors.Join(startupError(ctx, "apply migrations", err), db.Close())
	}
	return db, nil
}

func waitForDatabase(ctx context.Context, db *sql.DB) error {
	for {
		err := db.PingContext(ctx)
		if err == nil {
			return nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && !strings.HasPrefix(pgErr.Code, "08") &&
			!strings.HasPrefix(pgErr.Code, "53") && pgErr.Code != "57P03" {
			return startupError(ctx, "connect to database", err)
		}
		timer := time.NewTimer(time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return startupError(ctx, "connect to database", ctx.Err())
		case <-timer.C:
		}
	}
}

func startupError(ctx context.Context, stage string, err error) error {
	if ctx.Err() != nil {
		return fmt.Errorf("%s: %w", stage, ctx.Err())
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return fmt.Errorf("%s failed (SQLSTATE %s)", stage, pgErr.Code)
	}
	return fmt.Errorf("%s failed", stage)
}
