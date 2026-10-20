// Package migrations provides the embedded PostgreSQL schema for the CLI and tests.
package migrations

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"embed"
	"errors"

	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed *.sql
var files embed.FS

// Provider serializes complete goose operations, including version-table creation.
// goose's own session locker does not protect its initial HasPending query.
type Provider struct {
	db    *sql.DB
	goose *goose.Provider
}

// New creates a PostgreSQL migration provider. The caller owns and closes db.
func New(db *sql.DB) (*Provider, error) {
	provider, err := goose.NewProvider(goose.DialectPostgres, db, files, goose.WithDisableGlobalRegistry(true))
	if err != nil {
		return nil, err
	}
	return &Provider{db: db, goose: provider}, nil
}

// Up applies pending migrations under a PostgreSQL advisory lock.
func (p *Provider) Up(ctx context.Context) (results []*goose.MigrationResult, err error) {
	err = p.withLock(ctx, func() error {
		var runErr error
		results, runErr = p.goose.Up(ctx)
		return runErr
	})
	return results, err
}

// Down reverts the latest migration under the same lock used by startup.
func (p *Provider) Down(ctx context.Context) (result *goose.MigrationResult, err error) {
	err = p.withLock(ctx, func() error {
		var runErr error
		result, runErr = p.goose.Down(ctx)
		return runErr
	})
	return result, err
}

// Status reads migration status without racing initial version-table creation.
func (p *Provider) Status(ctx context.Context) (results []*goose.MigrationStatus, err error) {
	err = p.withLock(ctx, func() error {
		var runErr error
		results, runErr = p.goose.Status(ctx)
		return runErr
	})
	return results, err
}

func (p *Provider) withLock(ctx context.Context, run func() error) (retErr error) {
	conn, err := p.db.Conn(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err := conn.Close(); !errors.Is(err, sql.ErrConnDone) {
			retErr = errors.Join(retErr, err)
		}
	}()
	// The dedicated connection holds the session lock while goose uses the pool.
	// The same context bounds acquisition, all goose work and release.
	if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", lock.DefaultLockID); err != nil {
		return err
	}
	defer func() {
		_, err := conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", lock.DefaultLockID)
		if err != nil {
			// Never return a connection with an unreleased session lock to the pool.
			discardErr := conn.Raw(func(any) error { return driver.ErrBadConn })
			if !errors.Is(discardErr, driver.ErrBadConn) && !errors.Is(discardErr, sql.ErrConnDone) {
				retErr = errors.Join(retErr, discardErr)
			}
			retErr = errors.Join(retErr, err)
		}
	}()
	return run()
}
