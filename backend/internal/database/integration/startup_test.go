//go:build !unit

package integration_test

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pressly/goose/v3/lock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/database"
)

func startupDatabase(t *testing.T, name string) string {
	t.Helper()
	_, err := pool.Exec(t.Context(), "CREATE DATABASE "+pgx.Identifier{name}.Sanitize())
	require.NoError(t, err)
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, err := pool.Exec(ctx, "DROP DATABASE "+pgx.Identifier{name}.Sanitize()+" WITH (FORCE)")
		assert.NoError(t, err)
	})
	config := pool.Config().ConnConfig.Copy()
	dsn, err := url.Parse(config.ConnString())
	require.NoError(t, err)
	dsn.Path = "/" + name
	return dsn.String()
}

func TestConcurrentStartupMigratesOnceAndPreservesData(t *testing.T) {
	dsn := startupDatabase(t, "startup_concurrent")
	var wg sync.WaitGroup
	databases := make(chan *sql.DB, 2)
	failures := make(chan error, 2)
	for range 2 {
		wg.Go(func() {
			db, err := database.Prepare(t.Context(), dsn)
			databases <- db
			failures <- err
		})
	}
	wg.Wait()
	close(databases)
	close(failures)
	for err := range failures {
		require.NoError(t, err)
	}
	var first *sql.DB
	for db := range databases {
		t.Cleanup(func() { assert.NoError(t, db.Close()) })
		first = db
	}
	var applied int
	require.NoError(t, first.QueryRowContext(t.Context(), "SELECT count(*) FROM goose_db_version WHERE version_id = 1 AND is_applied").Scan(&applied))
	require.Equal(t, 1, applied)
	_, err := first.ExecContext(t.Context(), "INSERT INTO example_records (value) VALUES ('survives startup')")
	require.NoError(t, err)
	restarted, err := database.Prepare(t.Context(), dsn)
	require.NoError(t, err)
	defer func() { assert.NoError(t, restarted.Close()) }()
	var value string
	require.NoError(t, restarted.QueryRowContext(t.Context(), "SELECT value FROM example_records").Scan(&value))
	require.Equal(t, "survives startup", value)
}

func TestStartupLockWaitSharesOverallBudget(t *testing.T) {
	dsn := startupDatabase(t, "startup_locked")
	connection, err := pgx.Connect(t.Context(), dsn)
	require.NoError(t, err)
	t.Cleanup(func() { assert.NoError(t, connection.Close(context.Background())) })
	_, err = connection.Exec(t.Context(), "SELECT pg_advisory_lock($1)", lock.DefaultLockID)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(t.Context(), 150*time.Millisecond)
	defer cancel()
	started := time.Now()
	db, err := database.Prepare(ctx, dsn)
	require.Nil(t, db)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(started), time.Second)
	var versionTableMissing bool
	require.NoError(t, connection.QueryRow(t.Context(), "SELECT to_regclass('goose_db_version') IS NULL").Scan(&versionTableMissing))
	require.True(t, versionTableMissing, "the lock must also protect goose metadata creation")
	_, err = connection.Exec(t.Context(), "SELECT pg_advisory_unlock($1)", lock.DefaultLockID)
	require.NoError(t, err)
	db, err = database.Prepare(t.Context(), dsn)
	require.NoError(t, err)
	require.NoError(t, db.Close())
}

func TestMigrationFailureStopsStartupWithoutRetry(t *testing.T) {
	dsn := startupDatabase(t, "startup_broken")
	connection, err := pgx.Connect(t.Context(), dsn)
	require.NoError(t, err)
	defer func() { assert.NoError(t, connection.Close(context.Background())) }()
	_, err = connection.Exec(t.Context(), "CREATE TABLE example_records (value text)")
	require.NoError(t, err)
	started := time.Now()
	db, err := database.Prepare(t.Context(), dsn)
	require.Nil(t, db)
	require.ErrorContains(t, err, "apply migrations failed (SQLSTATE 42P07)")
	require.Less(t, time.Since(started), 2*time.Second)
}

func TestMigrationExecutionSharesOverallBudget(t *testing.T) {
	dsn := startupDatabase(t, "startup_query_timeout")
	connection, err := pgx.Connect(t.Context(), dsn)
	require.NoError(t, err)
	defer func() { assert.NoError(t, connection.Close(context.Background())) }()
	// A database event trigger delays actual DDL in the embedded migration.
	_, err = connection.Exec(t.Context(), `
 CREATE FUNCTION delay_ddl() RETURNS event_trigger LANGUAGE plpgsql AS
 $$ BEGIN IF position('example_records' in current_query()) > 0 THEN PERFORM pg_sleep(10); END IF; END $$;
 CREATE EVENT TRIGGER delay_migration ON ddl_command_start
 WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION delay_ddl();`)
	require.NoError(t, err)
	ctx, cancel := context.WithTimeout(t.Context(), 150*time.Millisecond)
	defer cancel()
	started := time.Now()
	db, err := database.Prepare(ctx, dsn)
	require.Nil(t, db)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(started), time.Second)
}

func TestAuthenticationFailureStopsStartupWithoutLeakingCredentials(t *testing.T) {
	config := pool.Config().ConnConfig.Copy()
	dsn, err := url.Parse(config.ConnString())
	require.NoError(t, err)
	dsn.User = url.UserPassword("missing_user", "secret_password")
	started := time.Now()
	db, err := database.Prepare(t.Context(), dsn.String())
	require.Nil(t, db)
	require.Error(t, err)
	require.NotContains(t, fmt.Sprint(err), "secret_password")
	require.Less(t, time.Since(started), 2*time.Second)
}
