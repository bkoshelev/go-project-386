//go:build !unit

package integration_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/httpserver"
)

func TestDatabaseShutdownDiscardsOtherPooledConnections(t *testing.T) {
	config := pool.Config()
	// Keep detection in the request, independent of pgxpool's idle ping timing.
	config.ShouldPing = func(_ context.Context, _ pgxpool.ShouldPingParams) bool { return false }
	applicationPool, err := pgxpool.NewWithConfig(t.Context(), config)
	require.NoError(t, err)
	t.Cleanup(applicationPool.Close)

	connections := make([]*pgxpool.Conn, 0, 3)
	for range 3 {
		connection, err := applicationPool.Acquire(t.Context())
		require.NoError(t, err)
		t.Cleanup(connection.Release)
		connections = append(connections, connection)
	}
	for _, connection := range connections {
		pid := connection.Conn().PgConn().PID()
		connection.Release()
		var terminated bool
		require.NoError(t, pool.QueryRow(t.Context(), "SELECT pg_terminate_backend($1, 1000)", pid).Scan(&terminated))
		require.True(t, terminated)
	}
	require.EqualValues(t, 3, applicationPool.Stat().IdleConns())

	router, err := httpserver.NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", httpserver.Options{
		Database: applicationPool,
	})
	require.NoError(t, err)
	request := func() *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/api/owner", nil))
		return response
	}
	failed := request()
	require.Equal(t, http.StatusInternalServerError, failed.Code, failed.Body.String())
	require.JSONEq(t, `{"code":"internal_error","message":"Внутренняя ошибка сервера"}`, failed.Body.String())
	require.Zero(t, applicationPool.Stat().IdleConns(), "shutdown must discard all stale idle connections")
	recovered := request()
	require.Equal(t, http.StatusOK, recovered.Code, recovered.Body.String())
}
