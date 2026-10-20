package config

import (
	"errors"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

const defaultHTTPAddr = "127.0.0.1:8080"

// Config contains the runtime configuration of the backend.
type Config struct {
	// HTTPAddr is the TCP address on which the HTTP server listens.
	HTTPAddr string
	// DatabaseURL is the required PostgreSQL connection string, including TLS settings.
	DatabaseURL string
}

// Load reads and validates the backend configuration from the environment.
func Load() (Config, error) {
	addr, exists := os.LookupEnv("HTTP_ADDR")
	if !exists {
		addr = defaultHTTPAddr
		if port, set := os.LookupEnv("PORT"); set {
			number, err := strconv.Atoi(port)
			if err != nil || number < 1 || number > 65535 {
				return Config{}, errors.New("PORT must be an integer between 1 and 65535")
			}
			addr = net.JoinHostPort("0.0.0.0", port)
		}
	}
	if addr == "" {
		return Config{}, errors.New("HTTP_ADDR must not be empty")
	}
	if _, port, err := net.SplitHostPort(addr); err != nil {
		return Config{}, errors.New("HTTP_ADDR must be a host:port address")
	} else if number, err := strconv.Atoi(port); err != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("HTTP_ADDR port must be an integer between 1 and 65535")
	}
	dsn := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(dsn) == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if _, err := pgx.ParseConfig(dsn); err != nil {
		return Config{}, errors.New("DATABASE_URL must be a valid PostgreSQL connection string")
	}
	return Config{HTTPAddr: addr, DatabaseURL: dsn}, nil
}
