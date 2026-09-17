package config

import (
	"fmt"
	"os"
)

const defaultHTTPAddr = "127.0.0.1:8080"

// Config contains the runtime configuration of the backend.
type Config struct {
	// HTTPAddr is the TCP address on which the HTTP server listens.
	HTTPAddr string
}

// Load reads and validates the backend configuration from the environment.
func Load() (Config, error) {
	addr, exists := os.LookupEnv("HTTP_ADDR")
	if !exists {
		addr = defaultHTTPAddr
	}

	if addr == "" {
		return Config{}, fmt.Errorf("HTTP_ADDR must not be empty")
	}

	return Config{HTTPAddr: addr}, nil
}
