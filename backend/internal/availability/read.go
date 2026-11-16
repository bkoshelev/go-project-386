package availability

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
	"github.com/bkoshelev/go-project-386/backend/internal/scheduling"
)

// ErrEventTypeNotFound means the requested meeting type no longer exists.
var ErrEventTypeNotFound = errors.New("event type not found")

// Read loads the current event duration and schedule without reserving time.
func Read(ctx context.Context, queries *db.Queries, eventID uuid.UUID, now time.Time) (Result, error) {
	snapshot, err := Load(ctx, queries, eventID, now)
	if err != nil {
		return Result{}, err
	}
	return snapshot.Suggestions(), nil
}

// Load reads a coherent snapshot when the caller holds the calendar lock.
func Load(ctx context.Context, queries *db.Queries, eventID uuid.UUID, now time.Time) (Snapshot, error) {
	if queries == nil {
		return Snapshot{}, errors.New("database is not configured")
	}
	event, err := queries.GetEventType(ctx, pgtype.UUID{Bytes: eventID, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return Snapshot{}, ErrEventTypeNotFound
	}
	if err != nil {
		return Snapshot{}, fmt.Errorf("read event type: %w", err)
	}
	schedule, err := queries.GetAvailabilitySchedule(ctx)
	if err != nil {
		return Snapshot{}, fmt.Errorf("read availability schedule: %w", err)
	}
	if !schedule.TimeZone.Valid {
		return newSnapshot(scheduling.Week{}, nil, time.Duration(event.DurationMinutes)*time.Minute, now, nil), nil
	}
	location, err := time.LoadLocation(schedule.TimeZone.String)
	if err != nil {
		return Snapshot{}, fmt.Errorf("load schedule time zone: %w", err)
	}
	var week scheduling.Week
	if err := json.Unmarshal(schedule.WeeklyAvailability, &week); err != nil {
		return Snapshot{}, fmt.Errorf("decode availability schedule: %w", err)
	}
	var dates map[string]scheduling.Date
	if err := json.Unmarshal(schedule.DateAvailability, &dates); err != nil {
		return Snapshot{}, fmt.Errorf("decode date availability: %w", err)
	}
	snapshot := newSnapshot(week, location, time.Duration(event.DurationMinutes)*time.Minute, now, dates)
	snapshot.EventName = event.Name
	snapshot.Pause = time.Duration(schedule.MeetingPauseMinutes) * time.Minute
	busy, err := queries.ListBusyBookings(ctx, db.ListBusyBookingsParams{EndsAt: pgtype.Timestamptz{Time: snapshot.Window.WindowStartsAt.Add(-snapshot.Pause), Valid: true}, StartsAt: pgtype.Timestamptz{Time: snapshot.Window.WindowEndsAt.Add(snapshot.Pause), Valid: true}})
	if err != nil {
		return Snapshot{}, fmt.Errorf("read busy bookings: %w", err)
	}
	for _, row := range busy {
		snapshot.Busy = append(snapshot.Busy, Slot{StartsAt: row.StartsAt.Time, EndsAt: row.EndsAt.Time})
	}
	return snapshot, nil
}

// Database opens a transaction for a consistent, non-reserving availability check.
type Database interface {
	Begin(context.Context) (pgx.Tx, error)
}

// Check reads the current calendar under its lock and checks a start without writing a booking.
func Check(ctx context.Context, database Database, eventID uuid.UUID, startsAt time.Time, now func() time.Time) (slot Slot, reason Reason, err error) {
	if database == nil {
		return Slot{}, "", errors.New("database is not configured")
	}
	tx, err := database.Begin(ctx)
	if err != nil {
		return Slot{}, "", fmt.Errorf("begin availability check: %w", err)
	}
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if rollbackErr := tx.Rollback(cleanupCtx); rollbackErr != nil && !errors.Is(rollbackErr, pgx.ErrTxClosed) {
			err = errors.Join(err, fmt.Errorf("rollback availability check: %w", rollbackErr))
		}
	}()
	queries := db.New(tx)
	if _, err := queries.LockCalendar(ctx); err != nil {
		return Slot{}, "", fmt.Errorf("lock calendar: %w", err)
	}
	snapshot, err := Load(ctx, queries, eventID, now())
	if err != nil {
		return Slot{}, "", err
	}
	reason = snapshot.Check(startsAt)
	if reason == "" {
		slot = Slot{StartsAt: startsAt.UTC(), EndsAt: startsAt.Add(snapshot.Duration).UTC()}
	}
	return slot, reason, nil
}
