package httpserver

import (
	"context"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

// Options supplies the external dependencies served by the router.
type Options struct {
	// Database supplies the application's PostgreSQL connection pool.
	Database db.DBTX
	// Readiness checks database access using the request's bounded context.
	Readiness func(context.Context) error
	// Frontend contains the production assets; nil disables frontend serving.
	Frontend fs.FS
}

// NewRouter creates the backend HTTP router with logging and panic recovery.
func NewRouter(logger *slog.Logger, mode string, options Options) (*gin.Engine, error) {
	gin.SetMode(mode)

	router := gin.New()
	router.Use(accessLogger(logger), recovery(logger))

	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("disable trusted proxies: %w", err)
	}

	handler := applicationHandler{healthHandler: healthHandler{checkReady: options.Readiness}}
	if options.Database != nil {
		handler.queries = db.New(options.Database)
	}
	if err := registerAPI(router, logger, handler); err != nil {
		return nil, err
	}
	if options.Frontend != nil {
		if err := serveFrontend(router, options.Frontend); err != nil {
			return nil, err
		}
	}

	return router, nil
}

type applicationHandler struct {
	healthHandler
	queries *db.Queries
}

type healthHandler struct{ checkReady func(context.Context) error }

func (healthHandler) GetHealth(context.Context, api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	return api.GetHealth200JSONResponse{Status: api.Ok}, nil
}

func (h healthHandler) GetReadiness(ctx context.Context, _ api.GetReadinessRequestObject) (api.GetReadinessResponseObject, error) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if h.checkReady == nil || h.checkReady(ctx) != nil || ctx.Err() != nil {
		return api.GetReadiness503JSONResponse{
			Code:    api.GetReadiness503JSONResponseBodyCodeServiceUnavailable,
			Message: "База данных недоступна",
		}, nil
	}
	return api.GetReadiness200JSONResponse{Status: api.Ok}, nil
}

func registerAPI(router gin.IRouter, logger *slog.Logger, handler api.StrictServerInterface) error {
	validator, err := newRequestValidator()
	if err != nil {
		return err
	}
	adapter := errorAdapter{logger: logger}
	strict := api.NewStrictHandlerWithOptions(handler, nil, api.StrictGinServerOptions{
		RequestErrorHandlerFunc:  adapter.requestError,
		HandlerErrorFunc:         adapter.internalError,
		ResponseErrorHandlerFunc: adapter.internalError,
	})
	api.RegisterHandlersWithOptions(router.Group("", validator.middleware()), strict, api.GinServerOptions{
		ErrorHandler: adapter.pathError,
	})
	return nil
}

func accessLogger(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		started := time.Now()
		method := c.Request.Method
		path := c.Request.URL.Path

		c.Next()

		logger.Info("http request",
			slog.String("method", method),
			slog.String("path", path),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("duration", time.Since(started)),
		)
	}
}

func recovery(logger *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if recovered := recover(); recovered != nil {
				logger.Error("panic recovered",
					slog.String("panic", fmt.Sprint(recovered)),
					slog.String("stack", string(debug.Stack())),
				)
				c.AbortWithStatus(http.StatusInternalServerError)
			}
		}()

		c.Next()
	}
}
