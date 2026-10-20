// Command migrate applies the embedded schema to an explicitly supplied PostgreSQL database.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/bkoshelev/go-project-386/backend/internal/database/migrations"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	if err := execute(ctx, os.Args[1:], os.Stdout); err != nil && !errors.Is(err, flag.ErrHelp) {
		slog.Error("migration failed", slog.Any("error", err))
		os.Exit(1)
	}
}

func execute(ctx context.Context, args []string, out io.Writer) (retErr error) {
	flags := flag.NewFlagSet("migrate", flag.ContinueOnError)
	flags.SetOutput(out)
	dsn := flags.String("dsn", "", "PostgreSQL connection string (defaults to DATABASE_URL)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *dsn == "" {
		*dsn = os.Getenv("DATABASE_URL")
	}
	if strings.TrimSpace(*dsn) == "" {
		return errors.New("-dsn or DATABASE_URL is required")
	}
	if flags.NArg() != 1 {
		return errors.New("expected up, down or status")
	}
	operation := flags.Arg(0)
	if operation != "up" && operation != "down" && operation != "status" {
		return errors.New("expected up, down or status")
	}
	config, err := pgx.ParseConfig(*dsn)
	if err != nil {
		// Parser errors can include the connection string and its credentials.
		return errors.New("invalid PostgreSQL connection string")
	}
	db := stdlib.OpenDB(*config)
	defer func() { retErr = errors.Join(retErr, db.Close()) }()
	provider, err := migrations.New(db)
	if err != nil {
		return fmt.Errorf("create migration provider: %w", err)
	}
	switch operation {
	case "up":
		results, err := provider.Up(ctx)
		if err != nil {
			return errors.New("migrate up failed")
		}
		_, err = fmt.Fprintf(out, "Applied %d migration(s)\n", len(results))
		return err
	case "down":
		result, err := provider.Down(ctx)
		if err != nil {
			return errors.New("migrate down failed")
		}
		_, err = fmt.Fprintln(out, result)
		return err
	case "status":
		status, err := provider.Status(ctx)
		if err != nil {
			return errors.New("migration status failed")
		}
		for _, migration := range status {
			if _, err := fmt.Fprintf(out, "%05d\t%s\t%s\n", migration.Source.Version, migration.State, migration.Source.Path); err != nil {
				return err
			}
		}
	}
	return nil
}
