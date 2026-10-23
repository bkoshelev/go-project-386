//go:build !unit

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/database/migrations"
)

func TestMigrationsUpRepeatDownUp(t *testing.T) {
	ctx := t.Context()
	_, err := pool.Exec(ctx, "CREATE DATABASE migration_cycle")
	require.NoError(t, err)
	t.Cleanup(func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, err := pool.Exec(cleanupCtx, "DROP DATABASE migration_cycle")
		assert.NoError(t, err)
	})

	config := pool.Config().ConnConfig.Copy()
	config.Database = "migration_cycle"
	sqlDB := stdlib.OpenDB(*config)
	t.Cleanup(func() { assert.NoError(t, sqlDB.Close()) })
	provider, err := migrations.New(sqlDB)
	require.NoError(t, err)

	applied, err := provider.Up(ctx)
	require.NoError(t, err)
	require.Len(t, applied, 5)
	assert.EqualValues(t, 1, applied[0].Source.Version)
	assert.EqualValues(t, 2, applied[1].Source.Version)
	var relation string
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT to_regclass('example_records')::text").Scan(&relation))
	assert.Equal(t, "example_records", relation)

	applied, err = provider.Up(ctx)
	require.NoError(t, err)
	assert.Empty(t, applied, "a repeated up must not apply the migration again")

	reverted, err := provider.Down(ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 5, reverted.Source.Version)
	var missing bool
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduling_settings' AND column_name = 'date_availability')").Scan(&missing))
	assert.True(t, missing, "down must remove the date availability column")

	applied, err = provider.Up(ctx)
	require.NoError(t, err)
	require.Len(t, applied, 1)
	status, err := provider.Status(ctx)
	require.NoError(t, err)
	require.Len(t, status, 5)
	assert.Equal(t, goose.StateApplied, status[4].State)
	assert.Equal(t, goose.StateApplied, status[3].State)
	assert.Equal(t, goose.StateApplied, status[2].State)
	assert.Equal(t, goose.StateApplied, status[1].State)
	assert.Equal(t, goose.StateApplied, status[0].State)
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT to_regclass('example_records')::text").Scan(&relation))
	assert.Equal(t, "example_records", relation)

	// The shared database must retain its schema while migrations run elsewhere.
	require.NoError(t, pool.QueryRow(ctx, "SELECT to_regclass('example_records')::text").Scan(&relation))
	assert.Equal(t, "example_records", relation)
}
