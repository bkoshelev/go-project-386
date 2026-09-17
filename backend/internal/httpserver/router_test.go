package httpserver

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestSmokeHealth(t *testing.T) {
	router := newTestRouter(t, io.Discard)
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, "application/json; charset=utf-8", response.Header().Get("Content-Type"))
	require.JSONEq(t, `{"status":"ok"}`, response.Body.String())
}

func TestAccessLogContainsRequestMetadataWithoutSensitiveData(t *testing.T) {
	var output bytes.Buffer
	router := newTestRouter(t, &output)
	request := httptest.NewRequest(http.MethodGet, "/healthz?token=secret-query", strings.NewReader("secret-body"))
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
	router.ServeHTTP(panicResponse, httptest.NewRequest(http.MethodGet, "/panic", nil))

	require.Equal(t, http.StatusInternalServerError, panicResponse.Code)
	require.Empty(t, panicResponse.Body.String())
	require.Contains(t, output.String(), `"msg":"panic recovered"`)
	require.Contains(t, output.String(), `"panic":"test panic"`)

	healthResponse := httptest.NewRecorder()
	router.ServeHTTP(healthResponse, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	require.Equal(t, http.StatusOK, healthResponse.Code)
}

func newTestRouter(t *testing.T, output io.Writer) *gin.Engine {
	t.Helper()

	logger := slog.New(slog.NewJSONHandler(output, nil))
	router, err := NewRouter(logger, gin.TestMode)
	require.NoError(t, err)

	return router
}
