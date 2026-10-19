package httpserver

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func writeBadRequest(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"code": "bad_request", "message": "Некорректный запрос"})
}

func writeInternalError(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"code": "internal_error", "message": "Внутренняя ошибка сервера"})
}

type errorAdapter struct{ logger *slog.Logger }

func (a errorAdapter) pathError(c *gin.Context, _ error, _ int) { writeBadRequest(c) }

func (a errorAdapter) requestError(c *gin.Context, err error) {
	var syntax *json.SyntaxError
	if errors.As(err, &syntax) || errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
		writeBadRequest(c)
		return
	}
	field := ""
	var typed *json.UnmarshalTypeError
	if errors.As(err, &typed) && typed.Field != "" {
		field = pointer(strings.Split(typed.Field, "."))
	}
	writeValidationError(c, []api.FieldIssue{issue(field, api.InvalidFormat, "Проверьте значение поля")})
}

func (a errorAdapter) internalError(c *gin.Context, err error) {
	a.logger.Error("API handler failed", slog.Any("error", err))
	// A failed socket write may already have committed headers. Encoding failures
	// are buffered by the generator and can still be replaced with a JSON error.
	if c.Writer.Written() {
		c.Abort()
		return
	}
	writeInternalError(c)
}
