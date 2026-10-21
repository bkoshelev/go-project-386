package httpserver

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSmokeHealth(t *testing.T) {
	router := newTestRouter(t, io.Discard)
	request := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	mediaType, _, err := mime.ParseMediaType(response.Header().Get("Content-Type"))
	require.NoError(t, err)
	require.Equal(t, "application/json", mediaType)
	require.JSONEq(t, `{"status":"ok"}`, response.Body.String())
}

func TestAccessLogContainsRequestMetadataWithoutSensitiveData(t *testing.T) {
	var output bytes.Buffer
	router := newTestRouter(t, &output)
	request := httptest.NewRequestWithContext(
		t.Context(),
		http.MethodGet,
		"/healthz?token=secret-query",
		strings.NewReader("secret-body"),
	)
	request.Header.Set("Authorization", "secret-header")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	logLine := output.String()
	require.Contains(t, logLine, `"method":"GET"`)
	require.Contains(t, logLine, `"path":"/healthz"`)
	require.Contains(t, logLine, `"status":200`)
	require.Contains(t, logLine, `"duration":`)
	require.NotContains(t, logLine, "secret-query")
	require.NotContains(t, logLine, "secret-header")
	require.NotContains(t, logLine, "secret-body")
}

func TestRecoveryReturnsInternalServerErrorAndKeepsServing(t *testing.T) {
	var output bytes.Buffer
	router := newTestRouter(t, &output)
	router.GET("/panic", func(*gin.Context) {
		panic("test panic")
	})

	panicResponse := httptest.NewRecorder()
	panicRequest := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/panic", nil)
	router.ServeHTTP(panicResponse, panicRequest)

	require.Equal(t, http.StatusInternalServerError, panicResponse.Code)
	require.Empty(t, panicResponse.Body.String())
	require.Contains(t, output.String(), `"msg":"panic recovered"`)
	require.Contains(t, output.String(), `"panic":"test panic"`)

	healthResponse := httptest.NewRecorder()
	healthRequest := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	router.ServeHTTP(healthResponse, healthRequest)

	require.Equal(t, http.StatusOK, healthResponse.Code)
}

func newTestRouter(t *testing.T, output io.Writer) *gin.Engine {
	t.Helper()

	logger := slog.New(slog.NewJSONHandler(output, nil))
	router, err := NewRouter(logger, gin.TestMode, Options{})
	require.NoError(t, err)

	return router
}

func TestOnlyImplementedOperationsAreRegistered(t *testing.T) {
	router := newTestRouter(t, io.Discard)
	require.Len(t, router.Routes(), 11)
	for _, path := range []string{"/api/bookings", "/api/admin/bookings", "/api/admin/availability/dates/2026-10-19"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		require.Equal(t, http.StatusNotFound, response.Code)
	}
	// Pre-binding validation must not turn an unimplemented endpoint into a 422.
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/bookings", strings.NewReader(`{}`)))
	require.Equal(t, http.StatusNotFound, response.Code)
}

func TestReadinessTracksDatabaseAvailability(t *testing.T) {
	available := true
	router, err := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), gin.TestMode, Options{
		Readiness: func(context.Context) error {
			if !available {
				return errors.New("postgres://user:secret@database/private")
			}
			return nil
		},
	})
	require.NoError(t, err)
	for _, state := range []bool{true, false, true} {
		available = state
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/readyz", nil))
		if state {
			require.Equal(t, 200, response.Code)
			require.JSONEq(t, `{"status":"ok"}`, response.Body.String())
		} else {
			require.Equal(t, 503, response.Code)
			require.NotContains(t, response.Body.String(), "secret")
			health := httptest.NewRecorder()
			router.ServeHTTP(health, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))
			require.Equal(t, 200, health.Code)
		}
	}
}

func TestReadinessHasTwoSecondBudget(t *testing.T) {
	router, err := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), gin.TestMode, Options{
		Readiness: func(ctx context.Context) error { <-ctx.Done(); return ctx.Err() },
	})
	require.NoError(t, err)
	started := time.Now()
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/readyz", nil))
	require.Equal(t, 503, response.Code)
	require.InDelta(t, 2*time.Second, time.Since(started), float64(500*time.Millisecond))
}

func TestFrontendServesAssetsAndSPAPagesWithoutHidingMissingRoutes(t *testing.T) {
	router, err := NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), gin.TestMode, Options{
		Frontend: fstest.MapFS{
			"index.html":    &fstest.MapFile{Data: []byte("<html>calendar</html>")},
			"assets/app.js": &fstest.MapFile{Data: []byte("console.log('calendar')")},
		},
	})
	require.NoError(t, err)
	for _, path := range []string{"/", "/book/meeting", "/book/meeting/"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		require.Equal(t, 200, response.Code, path)
		require.Equal(t, "<html>calendar</html>", response.Body.String(), path)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/assets/app.js", nil))
	require.Equal(t, 200, response.Code)
	require.Contains(t, response.Body.String(), "console.log")
	for _, path := range []string{"/api", "/api/unknown", "/assets/missing.js", "/assets/missing", "/favicon.ico", "/healthz/missing", "/readyz/missing"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		require.Equal(t, 404, response.Code, path)
		require.NotContains(t, response.Body.String(), "<html>", path)
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/book/meeting", nil))
	require.Equal(t, 404, response.Code)
}
