package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func TestErrorAdapter(t *testing.T) {
	adapter := errorAdapter{logger: slog.New(slog.NewTextHandler(io.Discard, nil))}
	tests := []struct {
		name     string
		callback func(*gin.Context)
		status   int
		body     string
	}{
		{name: "path binding", callback: func(c *gin.Context) { adapter.pathError(c, errors.New("private details"), 400) }, status: 400, body: `{"code":"bad_request","message":"Некорректный запрос"}`},
		{name: "broken JSON", callback: func(c *gin.Context) { adapter.requestError(c, &json.SyntaxError{}) }, status: 400, body: `{"code":"bad_request","message":"Некорректный запрос"}`},
		{name: "empty JSON", callback: func(c *gin.Context) { adapter.requestError(c, io.EOF) }, status: 400, body: `{"code":"bad_request","message":"Некорректный запрос"}`},
		{name: "decode field", callback: func(c *gin.Context) { adapter.requestError(c, &json.UnmarshalTypeError{Field: "guest.name"}) }, status: 422, body: `{"code":"validation_error","message":"Проверьте данные формы","fields":[{"field":"/guest/name","code":"invalid_format","message":"Проверьте значение поля"}]}`},
		{name: "decode UUID", callback: func(c *gin.Context) { adapter.requestError(c, errors.New("private UUID details")) }, status: 422, body: `{"code":"validation_error","message":"Проверьте данные формы","fields":[{"field":"","code":"invalid_format","message":"Проверьте значение поля"}]}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(response)
			tt.callback(c)
			require.Equal(t, tt.status, response.Code)
			require.JSONEq(t, tt.body, response.Body.String())
			require.True(t, c.IsAborted())
		})
	}
}

type healthStub struct {
	applicationHandler
	health func(context.Context, api.GetHealthRequestObject) (api.GetHealthResponseObject, error)
}

func (f healthStub) GetHealth(ctx context.Context, request api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	return f.health(ctx, request)
}

func (healthStub) GetReadiness(context.Context, api.GetReadinessRequestObject) (api.GetReadinessResponseObject, error) {
	return api.GetReadiness200JSONResponse{Status: api.Ok}, nil
}

type brokenResponse struct{}

func (brokenResponse) VisitGetHealthResponse(http.ResponseWriter) error {
	return errors.New("private encoding details")
}

func TestStrictHandlerErrorsUseContract(t *testing.T) {
	for _, serialization := range []bool{false, true} {
		t.Run(map[bool]string{false: "application", true: "serialization"}[serialization], func(t *testing.T) {
			handler := healthStub{health: func(context.Context, api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
				if serialization {
					return brokenResponse{}, nil
				}
				return nil, errors.New("private application details")
			}}
			router := gin.New()
			require.NoError(t, registerAPI(router, slog.New(slog.NewTextHandler(io.Discard, nil)), handler))
			response := httptest.NewRecorder()
			router.ServeHTTP(response, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil))
			require.Equal(t, 500, response.Code)
			require.JSONEq(t, `{"code":"internal_error","message":"Внутренняя ошибка сервера"}`, response.Body.String())
		})
	}
}
