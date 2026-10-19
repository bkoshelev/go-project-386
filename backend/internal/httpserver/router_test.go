package httpserver

import (
	"bytes"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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
	router, err := NewRouter(logger, gin.TestMode)
	require.NoError(t, err)

	return router
}

func TestOnlyImplementedOperationsAreRegistered(t *testing.T) {
	router := newTestRouter(t, io.Discard)
	require.Len(t, router.Routes(), 1)
	require.Equal(t, "/healthz", router.Routes()[0].Path)
	require.Equal(t, http.MethodGet, router.Routes()[0].Method)
	for _, path := range []string{"/api/owner", "/api/event-types", "/api/bookings"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
		require.Equal(t, http.StatusNotFound, response.Code)
	}
	// Pre-binding validation must not turn an unimplemented endpoint into a 422.
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/bookings", strings.NewReader(`{}`)))
	require.Equal(t, http.StatusNotFound, response.Code)
}
