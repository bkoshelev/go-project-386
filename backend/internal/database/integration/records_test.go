//go:build !unit

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

func TestExampleRecordReceivesUUIDv7AndCanBeRead(t *testing.T) {
	queries := db.New(testTransaction(t))
	record, err := queries.CreateExampleRecord(t.Context(), "database example")
	require.NoError(t, err)
	require.True(t, record.ID.Valid)
	assert.Equal(t, byte(7), record.ID.Bytes[6]>>4, "PostgreSQL must generate a UUIDv7")
	assert.Equal(t, byte(2), record.ID.Bytes[8]>>6, "UUID must have the RFC 9562 variant")
	assert.Equal(t, "database example", record.Value)

	stored, err := queries.GetExampleRecord(t.Context(), record.ID)
	require.NoError(t, err)
	assert.Equal(t, record, stored)
}

func TestTransactionCleanupRollsBackAfterContextCancellation(t *testing.T) {
	var id pgtype.UUID
	require.True(t, t.Run("insert and cancel requests before cleanup", func(t *testing.T) {
		queries := db.New(testTransaction(t))
		ctx, cancel := context.WithCancel(t.Context())
		defer cancel()
		record, err := queries.CreateExampleRecord(ctx, "must be rolled back")
		require.NoError(t, err)
		id = record.ID
		cancel()
		require.ErrorIs(t, ctx.Err(), context.Canceled)
	}))

	queries := db.New(testTransaction(t))
	_, err := queries.GetExampleRecord(t.Context(), id)
	require.ErrorIs(t, err, pgx.ErrNoRows, "cleanup must roll back using a fresh context")
}

func testTransaction(t *testing.T) pgx.Tx {
	t.Helper()
	tx, err := pool.Begin(t.Context())
	require.NoError(t, err)
	t.Cleanup(func() {
		// t.Context is canceled before cleanup; cancellation does not roll back pgx transactions.
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		assert.NoError(t, tx.Rollback(ctx), "roll back test transaction")
	})
	return tx
}
