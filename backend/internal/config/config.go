package config

import (
	"errors"
	"net"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Config contains the runtime configuration of the backend.
type Config struct {
	// HTTPAddr is the TCP address on which the HTTP server listens.
	HTTPAddr string
	// DatabaseURL is the required PostgreSQL connection string, including TLS settings.
	DatabaseURL string
}

// Load reads and validates the backend configuration from the environment.
func Load() (Config, error) {
	port := os.Getenv("PORT")
	if strings.TrimSpace(port) == "" {
		return Config{}, errors.New("PORT is required")
	}
	for _, digit := range port {
		if digit < '0' || digit > '9' {
			return Config{}, errors.New("PORT must be an integer between 1 and 65535")
		}
	}
	number, err := strconv.Atoi(port)
	if err != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("PORT must be an integer between 1 and 65535")
	}
	addr := net.JoinHostPort("0.0.0.0", strconv.Itoa(number))
	dsn := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(dsn) == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if _, err := pgx.ParseConfig(dsn); err != nil {
		return Config{}, errors.New("DATABASE_URL must be a valid PostgreSQL connection string")
	}
	return Config{HTTPAddr: addr, DatabaseURL: dsn}, nil
}
