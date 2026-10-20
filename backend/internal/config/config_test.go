package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadUsesDefaultAddress(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:password@localhost/calendar?sslmode=disable")
	t.Setenv("PORT", "")
	require.NoError(t, os.Unsetenv("PORT"))
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
	t.Setenv("DATABASE_URL", "postgres://localhost/calendar")
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

func TestLoadPlatformPortAndAddressOverride(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/calendar")
	t.Setenv("HTTP_ADDR", "unused")
	require.NoError(t, os.Unsetenv("HTTP_ADDR"))
	t.Setenv("PORT", "10000")
	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, "0.0.0.0:10000", cfg.HTTPAddr)
	t.Setenv("HTTP_ADDR", "0.0.0.0:9090")
	t.Setenv("PORT", "invalid")
	cfg, err = Load()
	require.NoError(t, err)
	require.Equal(t, "0.0.0.0:9090", cfg.HTTPAddr)
}

func TestLoadRejectsInvalidPortAndDatabaseWithoutLeakingSecrets(t *testing.T) {
	t.Setenv("HTTP_ADDR", "unused")
	require.NoError(t, os.Unsetenv("HTTP_ADDR"))
	t.Setenv("DATABASE_URL", "postgres://localhost/calendar")
	for _, port := range []string{"", "0", "65536", "-1", "abc", "80:90"} {
		t.Setenv("PORT", port)
		_, err := Load()
		require.ErrorContains(t, err, "PORT")
	}
	t.Setenv("PORT", "8080")
	for _, dsn := range []string{"", "  ", "postgres://user:secret@localhost:bad/private"} {
		t.Setenv("DATABASE_URL", dsn)
		_, err := Load()
		require.ErrorContains(t, err, "DATABASE_URL")
		require.NotContains(t, err.Error(), "secret")
		require.NotContains(t, err.Error(), "private")
	}
}
