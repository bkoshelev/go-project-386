package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func unset(t *testing.T, key string) {
	t.Helper()
	t.Setenv(key, "")
	require.NoError(t, os.Unsetenv(key))
}

func TestLoadRequiresValidPort(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/calendar")
	t.Setenv("HTTP_ADDR", "127.0.0.1:9090")
	unset(t, "PORT")
	_, err := Load()
	require.ErrorContains(t, err, "PORT")
	for _, port := range []string{"", "  ", "0", "65536", "-1", "+1", "1.5", "abc", "80:90"} {
		t.Run(port, func(t *testing.T) {
			t.Setenv("PORT", port)
			_, err := Load()
			require.ErrorContains(t, err, "PORT")
		})
	}
}

func TestLoadIgnoresHTTPAddr(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/calendar")
	t.Setenv("PORT", "10000")
	for _, addr := range []string{"", "invalid", "127.0.0.1:9090"} {
		t.Setenv("HTTP_ADDR", addr)
		cfg, err := Load()
		require.NoError(t, err)
		require.Equal(t, "0.0.0.0:10000", cfg.HTTPAddr)
	}
}

func TestLoadRequiresValidDatabaseURLWithoutLeakingSecrets(t *testing.T) {
	t.Setenv("PORT", "8080")
	unset(t, "DATABASE_URL")
	_, err := Load()
	require.ErrorContains(t, err, "DATABASE_URL")
	for _, dsn := range []string{"", "  ", "postgres://user:secret@localhost:bad/private"} {
		t.Setenv("DATABASE_URL", dsn)
		_, err := Load()
		require.ErrorContains(t, err, "DATABASE_URL")
		require.NotContains(t, err.Error(), "secret")
		require.NotContains(t, err.Error(), "private")
	}
	unset(t, "PORT")
	unset(t, "DATABASE_URL")
	_, err = Load()
	require.Error(t, err)
}
