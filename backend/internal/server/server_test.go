package server

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNewConfiguresHTTPTimeouts(t *testing.T) {
	server := New("127.0.0.1:0", http.NotFoundHandler(), testLogger())

	require.Equal(t, ReadHeaderTimeout, server.httpServer.ReadHeaderTimeout)
	require.Equal(t, ReadTimeout, server.httpServer.ReadTimeout)
	require.Equal(t, WriteTimeout, server.httpServer.WriteTimeout)
	require.Equal(t, IdleTimeout, server.httpServer.IdleTimeout)
	require.Equal(t, ShutdownTimeout, server.shutdownTimeout)
}

func TestRunRejectsInvalidAddress(t *testing.T) {
	server := New("invalid address", http.NotFoundHandler(), testLogger())

	err := server.Run(context.Background())

	require.ErrorContains(t, err, `listen on "invalid address"`)
}

func TestRunFailsWhenPortIsOccupied(t *testing.T) {
	listener := listenLocal(t)
	server := New(listener.Addr().String(), http.NotFoundHandler(), testLogger())

	err := server.Run(context.Background())

	require.ErrorContains(t, err, "listen on")
}

func TestGracefulShutdownCompletesActiveRequest(t *testing.T) {
	listener := &closeTrackingListener{
		Listener: listenLocal(t),
		closed:   make(chan struct{}),
	}
	requestStarted := make(chan struct{})
	finishRequest := make(chan struct{})
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(requestStarted)
		<-finishRequest
		w.WriteHeader(http.StatusNoContent)
	})
	server := New(listener.Addr().String(), handler, testLogger())
	ctx, cancel := context.WithCancel(context.Background())
	serverDone := make(chan error, 1)
	go func() {
		serverDone <- server.serve(ctx, listener)
	}()

	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+listener.Addr().String(), nil)
	require.NoError(t, err)
	responseDone := make(chan error, 1)
	go func() {
		response, err := http.DefaultClient.Do(request)
		if err == nil {
			if response.StatusCode != http.StatusNoContent {
				err = &unexpectedStatusError{status: response.StatusCode}
			}
			if closeErr := response.Body.Close(); err == nil {
				err = closeErr
			}
		}
		responseDone <- err
	}()

	<-requestStarted
	cancel()
	<-listener.closed
	select {
	case err := <-serverDone:
		require.FailNow(t, "server stopped before active request completed", "error: %v", err)
	default:
	}
	close(finishRequest)

	require.NoError(t, <-responseDone)
	require.NoError(t, <-serverDone)
}

func TestShutdownTimeoutForcesConnectionsClosed(t *testing.T) {
	listener := listenLocal(t)
	requestStarted := make(chan struct{})
	handlerStopped := make(chan struct{})
	handler := http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		close(requestStarted)
		<-request.Context().Done()
		close(handlerStopped)
	})
	server := newWithShutdownTimeout(listener.Addr().String(), handler, testLogger(), 20*time.Millisecond)
	ctx, cancel := context.WithCancel(context.Background())
	serverDone := make(chan error, 1)
	go func() {
		serverDone <- server.serve(ctx, listener)
	}()

	request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+listener.Addr().String(), nil)
	require.NoError(t, err)
	responseDone := make(chan error, 1)
	go func() {
		response, err := http.DefaultClient.Do(request)
		if response != nil {
			if closeErr := response.Body.Close(); err == nil {
				err = closeErr
			}
		}
		responseDone <- err
	}()

	<-requestStarted
	cancel()

	require.ErrorContains(t, <-serverDone, "graceful HTTP shutdown")
	<-handlerStopped
	require.Error(t, <-responseDone)
}

func listenLocal(t *testing.T) net.Listener {
	t.Helper()

	var listenConfig net.ListenConfig
	listener, err := listenConfig.Listen(t.Context(), "tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() {
		if closeErr := listener.Close(); closeErr != nil {
			// The server can close its listener before test cleanup runs.
			require.ErrorIs(t, closeErr, net.ErrClosed)
		}
	})

	return listener
}

func testLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

type unexpectedStatusError struct {
	status int
}

func (e *unexpectedStatusError) Error() string {
	return http.StatusText(e.status)
}

type closeTrackingListener struct {
	net.Listener
	closed chan struct{}
	once   sync.Once
}

func (l *closeTrackingListener) Close() error {
	l.once.Do(func() {
		close(l.closed)
	})

	return l.Listener.Close()
}
