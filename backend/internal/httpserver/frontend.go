package httpserver

import (
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

func serveFrontend(router *gin.Engine, assets fs.FS) error {
	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return fmt.Errorf("read frontend index: %w", err)
	}
	files := http.FileServer(http.FS(assets))
	router.NoRoute(func(c *gin.Context) {
		urlPath := c.Request.URL.Path
		if (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) ||
			reservedPath(urlPath) {
			c.Status(http.StatusNotFound)
			return
		}
		name := strings.TrimPrefix(path.Clean(urlPath), "/")
		if info, err := fs.Stat(assets, name); err == nil && !info.IsDir() {
			files.ServeHTTP(c.Writer, c.Request)
			return
		}
		if strings.HasPrefix(urlPath, "/assets/") || urlPath == "/assets" || path.Ext(name) != "" {
			c.Status(http.StatusNotFound)
			return
		}
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Status(http.StatusOK)
		if c.Request.Method != http.MethodHead {
			c.Data(http.StatusOK, "text/html; charset=utf-8", index)
		}
	})
	return nil
}

func reservedPath(urlPath string) bool {
	for _, prefix := range []string{"/api", "/healthz", "/readyz"} {
		if urlPath == prefix || strings.HasPrefix(urlPath, prefix+"/") {
			return true
		}
	}
	return false
}
