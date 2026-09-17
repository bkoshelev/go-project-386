package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadUsesDefaultAddress(t *testing.T) {
	previous, exists := os.LookupEnv("HTTP_ADDR")
	require.NoError(t, os.Unsetenv("HTTP_ADDR"))
	t.Cleanup(func() {
		if exists {
			require.NoError(t, os.Setenv("HTTP_ADDR", previous))
		} else {
			require.NoError(t, os.Unsetenv("HTTP_ADDR"))
		}
	})

	cfg, err := Load()

	require.NoError(t, err)
	require.Equal(t, defaultHTTPAddr, cfg.HTTPAddr)
}

func TestLoadUsesConfiguredAddress(t *testing.T) {
	t.Setenv("HTTP_ADDR", "localhost:9090")

	cfg, err := Load()

	require.NoError(t, err)
	require.Equal(t, "localhost:9090", cfg.HTTPAddr)
}

func TestLoadRejectsEmptyAddress(t *testing.T) {
	t.Setenv("HTTP_ADDR", "")

	_, err := Load()

	require.EqualError(t, err, "HTTP_ADDR must not be empty")
}
