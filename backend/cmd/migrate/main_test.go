package main

import (
	"io"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMigrationCommandRequiresExplicitConnectionAndOperation(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	for _, test := range []struct {
		name string
		args []string
		want string
	}{
		{name: "no connection", args: []string{"up"}, want: "-dsn or DATABASE_URL is required"},
		{name: "blank connection", args: []string{"-dsn", "  ", "up"}, want: "-dsn or DATABASE_URL is required"},
		{name: "no operation", args: []string{"-dsn", "postgres://unused"}, want: "expected up, down or status"},
		{name: "unknown operation", args: []string{"-dsn", "postgres://unused", "reset"}, want: "expected up, down or status"},
		{name: "extra argument", args: []string{"-dsn", "postgres://unused", "up", "down"}, want: "expected up, down or status"},
	} {
		t.Run(test.name, func(t *testing.T) {
			require.ErrorContains(t, execute(t.Context(), test.args, io.Discard), test.want)
		})
	}
}
