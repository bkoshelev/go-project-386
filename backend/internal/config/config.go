package config

import (
	"fmt"
	"os"
)

const defaultHTTPAddr = "127.0.0.1:8080"

type Config struct {
	HTTPAddr string
}

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
