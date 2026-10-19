// Package migrations provides the embedded PostgreSQL schema for the CLI and tests.
package migrations

import (
	"database/sql"
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed *.sql
var files embed.FS

// New creates a PostgreSQL migration provider. The caller owns and closes db.
func New(db *sql.DB) (*goose.Provider, error) {
	return goose.NewProvider(goose.DialectPostgres, db, files, goose.WithDisableGlobalRegistry(true))
}
