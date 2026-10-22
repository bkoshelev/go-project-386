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
	if queries == nil {
		return Result{}, errors.New("database is not configured")
	}
	event, err := queries.GetEventType(ctx, pgtype.UUID{Bytes: eventID, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return Result{}, ErrEventTypeNotFound
	}
	if err != nil {
		return Result{}, fmt.Errorf("read event type: %w", err)
	}
	schedule, err := queries.GetAvailabilitySchedule(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("read availability schedule: %w", err)
	}
	if !schedule.TimeZone.Valid {
		return Calculate(scheduling.Week{}, nil, time.Duration(event.DurationMinutes)*time.Minute, now), nil
	}
	location, err := time.LoadLocation(schedule.TimeZone.String)
	if err != nil {
		return Result{}, fmt.Errorf("load schedule time zone: %w", err)
	}
	var week scheduling.Week
	if err := json.Unmarshal(schedule.WeeklyAvailability, &week); err != nil {
		return Result{}, fmt.Errorf("decode availability schedule: %w", err)
	}
	return Calculate(week, location, time.Duration(event.DurationMinutes)*time.Minute, now), nil
}
