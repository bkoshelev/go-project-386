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
		return newSnapshot(scheduling.Week{}, nil, time.Duration(event.DurationMinutes)*time.Minute, now), nil
	}
	location, err := time.LoadLocation(schedule.TimeZone.String)
	if err != nil {
		return Snapshot{}, fmt.Errorf("load schedule time zone: %w", err)
	}
	var week scheduling.Week
	if err := json.Unmarshal(schedule.WeeklyAvailability, &week); err != nil {
		return Snapshot{}, fmt.Errorf("decode availability schedule: %w", err)
	}
	snapshot := newSnapshot(week, location, time.Duration(event.DurationMinutes)*time.Minute, now)
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
