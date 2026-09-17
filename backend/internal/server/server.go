package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"
)

const (
	// ReadHeaderTimeout limits how long the server waits for request headers.
	ReadHeaderTimeout = 5 * time.Second
	// ReadTimeout limits how long the server spends reading a request.
	ReadTimeout = 10 * time.Second
	// WriteTimeout limits how long the server spends writing a response.
	WriteTimeout = 10 * time.Second
	// IdleTimeout limits how long an idle keep-alive connection remains open.
	IdleTimeout = 60 * time.Second
	// ShutdownTimeout limits graceful shutdown before connections are forced closed.
	ShutdownTimeout = 10 * time.Second
)

// Server runs the backend HTTP server and coordinates its graceful shutdown.
type Server struct {
	httpServer      *http.Server
	logger          *slog.Logger
	shutdownTimeout time.Duration
}

// New creates a Server listening on addr with the standard timeouts.
func New(addr string, handler http.Handler, logger *slog.Logger) *Server {
	return newWithShutdownTimeout(addr, handler, logger, ShutdownTimeout)
}

func newWithShutdownTimeout(addr string, handler http.Handler, logger *slog.Logger, shutdownTimeout time.Duration) *Server {
	return &Server{
		httpServer: &http.Server{
			Addr:              addr,
			Handler:           handler,
			ReadHeaderTimeout: ReadHeaderTimeout,
			ReadTimeout:       ReadTimeout,
			WriteTimeout:      WriteTimeout,
			IdleTimeout:       IdleTimeout,
		},
		logger:          logger,
		shutdownTimeout: shutdownTimeout,
	}
}

// Run serves requests until ctx is canceled or the HTTP server stops.
func (s *Server) Run(ctx context.Context) error {
	var listenConfig net.ListenConfig
	listener, err := listenConfig.Listen(ctx, "tcp", s.httpServer.Addr)
	if err != nil {
		return fmt.Errorf("listen on %q: %w", s.httpServer.Addr, err)
	}

	return s.serve(ctx, listener)
}

func (s *Server) serve(ctx context.Context, listener net.Listener) error {
	serveErr := make(chan error, 1)
	go func() {
		serveErr <- s.httpServer.Serve(listener)
	}()

	s.logger.Info("http server started", slog.String("address", listener.Addr().String()))

	select {
	case err := <-serveErr:
		if err == nil || errors.Is(err, http.ErrServerClosed) {
			s.logger.Info("http server stopped")
			return nil
		}
		return fmt.Errorf("serve HTTP: %w", err)
	case <-ctx.Done():
	}

	s.logger.Info("http server stopping")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), s.shutdownTimeout)
	defer cancel()

	if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
		closeErr := s.httpServer.Close()
		if closeErr != nil {
			s.logger.Error("force close HTTP server failed", slog.Any("error", closeErr))
		}
		s.logger.Error("graceful HTTP shutdown failed", slog.Any("error", err))
		return fmt.Errorf("graceful HTTP shutdown: %w", err)
	}

	if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP during shutdown: %w", err)
	}

	s.logger.Info("http server stopped")
	return nil
}
