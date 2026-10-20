package database_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/database"
)

func TestPrepareHonorsOverallDeadlineWithoutLeakingConnection(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()
	started := time.Now()
	db, err := database.Prepare(ctx, "postgres://user:secret@127.0.0.1:1/private?sslmode=disable")
	require.Nil(t, db)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	require.Less(t, time.Since(started), time.Second)
	require.NotContains(t, err.Error(), "secret")
	require.NotContains(t, err.Error(), "private")
}
