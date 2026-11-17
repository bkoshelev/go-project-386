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
	require.Len(t, applied, 6)
	assert.EqualValues(t, 1, applied[0].Source.Version)
	assert.EqualValues(t, 2, applied[1].Source.Version)
	var relation string
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT to_regclass('example_records')::text").Scan(&relation))
	assert.Equal(t, "example_records", relation)

	applied, err = provider.Up(ctx)
	require.NoError(t, err)
	assert.Empty(t, applied, "a repeated up must not apply the migration again")

	// Upgrade an existing schema containing an event type and a booking.
	_, err = provider.Down(ctx)
	require.NoError(t, err)
	_, err = sqlDB.ExecContext(ctx, `WITH event AS (
		INSERT INTO event_types (name, duration_minutes) VALUES ('existing', 60) RETURNING id
	) INSERT INTO bookings (event_type_id, starts_at, ends_at, guest_name, guest_email)
	SELECT id, '2030-01-01 09:00Z', '2030-01-01 10:00Z', 'Anna', 'anna@example.com' FROM event`)
	require.NoError(t, err)
	_, err = provider.Up(ctx)
	require.NoError(t, err)
	var bookingCount int
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT count(*) FROM bookings JOIN event_types ON event_types.id = bookings.event_type_id WHERE event_types.duration_minutes = 60").Scan(&bookingCount))
	assert.Equal(t, 1, bookingCount)

	// New values prevent rollback atomically and leave the row intact.
	_, err = sqlDB.ExecContext(ctx, "INSERT INTO event_types (name, duration_minutes) VALUES ('new', 90)")
	require.NoError(t, err)
	_, err = provider.Down(ctx)
	require.Error(t, err)
	var count int
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT count(*) FROM event_types WHERE duration_minutes IN (60, 90)").Scan(&count))
	assert.Equal(t, 2, count)
	_, err = sqlDB.ExecContext(ctx, "DELETE FROM event_types WHERE duration_minutes = 90")
	require.NoError(t, err)
	reverted, err := provider.Down(ctx)
	require.NoError(t, err)
	assert.EqualValues(t, 6, reverted.Source.Version)
	_, err = sqlDB.ExecContext(ctx, "INSERT INTO event_types (name, duration_minutes) VALUES ('invalid', 90)")
	require.Error(t, err)
	require.NoError(t, sqlDB.QueryRowContext(ctx, "SELECT count(*) FROM event_types WHERE duration_minutes = 60").Scan(&count))
	assert.Equal(t, 1, count)

	applied, err = provider.Up(ctx)
	require.NoError(t, err)
	require.Len(t, applied, 1)
	status, err := provider.Status(ctx)
	require.NoError(t, err)
	require.Len(t, status, 6)
	assert.Equal(t, goose.StateApplied, status[5].State)
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
