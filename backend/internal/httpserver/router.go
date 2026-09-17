package httpserver

import (
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
)

// NewRouter creates the backend HTTP router with logging and panic recovery.
func NewRouter(logger *slog.Logger, mode string) (*gin.Engine, error) {
	gin.SetMode(mode)

	router := gin.New()
	router.Use(accessLogger(logger), recovery(logger))

	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("disable trusted proxies: %w", err)
	}

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return router, nil
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
