// Package booking coordinates atomic calendar bookings and owner reads.
package booking

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/availability"
	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

// Database starts the transaction that owns the calendar lock.
type Database interface {
	Begin(context.Context) (pgx.Tx, error)
}

// Unavailable reports the first unmet calendar rule.
type Unavailable struct{ Reason availability.Reason }

func (e *Unavailable) Error() string { return string(e.Reason) }

// Create saves a meeting under the same lock used by scheduling updates.
func Create(ctx context.Context, database Database, eventID uuid.UUID, startsAt time.Time, name, email string, now func() time.Time) (result db.ListOwnerBookingsRow, err error) {
	if database == nil {
		return db.ListOwnerBookingsRow{}, errors.New("database is not configured")
	}
	tx, err := database.Begin(ctx)
	if err != nil {
		return db.ListOwnerBookingsRow{}, fmt.Errorf("begin booking: %w", err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if rollbackErr := tx.Rollback(cleanupCtx); rollbackErr != nil && !errors.Is(rollbackErr, pgx.ErrTxClosed) {
			err = errors.Join(err, fmt.Errorf("rollback booking: %w", rollbackErr))
		}
	}()
	queries := db.New(tx)
	if _, err := queries.LockCalendar(ctx); err != nil {
		return db.ListOwnerBookingsRow{}, fmt.Errorf("lock calendar: %w", err)
	}
	snapshot, err := availability.Load(ctx, queries, eventID, now())
	if err != nil {
		return db.ListOwnerBookingsRow{}, fmt.Errorf("read event: %w", err)
	}
	if reason := snapshot.Check(startsAt); reason != "" {
		return db.ListOwnerBookingsRow{}, &Unavailable{Reason: reason}
	}
	row, err := queries.CreateBooking(ctx, db.CreateBookingParams{EventTypeID: pgtype.UUID{Bytes: eventID, Valid: true}, StartsAt: pgtype.Timestamptz{Time: startsAt.UTC(), Valid: true}, EndsAt: pgtype.Timestamptz{Time: startsAt.Add(snapshot.Duration).UTC(), Valid: true}, GuestName: name, GuestEmail: email})
	if err != nil {
		return db.ListOwnerBookingsRow{}, fmt.Errorf("save booking: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return db.ListOwnerBookingsRow{}, fmt.Errorf("commit booking: %w", err)
	}
	return db.ListOwnerBookingsRow{ID: row.ID, EventTypeID: row.EventTypeID, StartsAt: row.StartsAt, EndsAt: row.EndsAt, GuestName: row.GuestName, GuestEmail: row.GuestEmail, EventTypeName: snapshot.EventName}, nil
}
