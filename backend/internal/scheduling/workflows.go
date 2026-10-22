package scheduling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

// ErrNotInitialized means the immutable first time zone has not been saved yet.
var ErrNotInitialized = errors.New("schedule is not initialized")

func requireDatabase(queries *db.Queries) error {
	if queries == nil {
		return errors.New("database is not configured")
	}
	return nil
}

// ReadSettings reads settings without initializing the time zone.
func ReadSettings(ctx context.Context, queries *db.Queries) (Settings, error) {
	if err := requireDatabase(queries); err != nil {
		return Settings{}, err
	}
	row, err := queries.GetSchedulingSettings(ctx)
	if err != nil {
		return Settings{}, fmt.Errorf("read scheduling settings: %w", err)
	}
	return settings(row.TimeZone, row.MeetingPauseMinutes), nil
}

// InitializeTimeZone preserves the first saved zone even under concurrent calls.
func InitializeTimeZone(ctx context.Context, queries *db.Queries, zone string) (Settings, error) {
	if fields := ValidateTimeZone(zone); len(fields) > 0 {
		return Settings{}, &ValidationError{Fields: fields}
	}
	if err := requireDatabase(queries); err != nil {
		return Settings{}, err
	}
	row, err := queries.InitializeScheduleTimeZone(ctx, pgtype.Text{String: zone, Valid: true})
	if err != nil {
		return Settings{}, fmt.Errorf("initialize schedule time zone: %w", err)
	}
	return settings(row.TimeZone, row.MeetingPauseMinutes), nil
}

// ReadWeek reads the complete persisted week.
func ReadWeek(ctx context.Context, queries *db.Queries) (Week, error) {
	if err := requireDatabase(queries); err != nil {
		return Week{}, err
	}
	data, err := queries.GetWeeklyAvailability(ctx)
	if err != nil {
		return Week{}, fmt.Errorf("read weekly availability: %w", err)
	}
	return decodeWeek(data)
}

// SaveWeek validates and atomically replaces the week in Monday-to-Sunday order.
func SaveWeek(ctx context.Context, queries *db.Queries, week Week) (Week, error) {
	if fields := week.Validate(); len(fields) > 0 {
		return Week{}, &ValidationError{Fields: fields}
	}
	if err := requireDatabase(queries); err != nil {
		return Week{}, err
	}
	weekdays := []Weekday{Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday}
	week.Days = slices.Clone(week.Days)
	slices.SortFunc(week.Days, func(a, b Day) int { return slices.Index(weekdays, a.Weekday) - slices.Index(weekdays, b.Weekday) })
	data, err := json.Marshal(week)
	if err != nil {
		return Week{}, fmt.Errorf("encode weekly availability: %w", err)
	}
	saved, err := queries.UpdateWeeklyAvailability(ctx, data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Week{}, ErrNotInitialized
	}
	if err != nil {
		return Week{}, fmt.Errorf("replace weekly availability: %w", err)
	}
	return decodeWeek(saved)
}

// UpdatePause updates only the meeting pause, leaving the time zone untouched.
func UpdatePause(ctx context.Context, queries *db.Queries, minutes int32) (Settings, error) {
	if err := requireDatabase(queries); err != nil {
		return Settings{}, err
	}
	row, err := queries.UpdateSchedulingSettings(ctx, minutes)
	if err != nil {
		return Settings{}, fmt.Errorf("update scheduling settings: %w", err)
	}
	return settings(row.TimeZone, row.MeetingPauseMinutes), nil
}

func settings(zone pgtype.Text, pause int32) Settings {
	result := Settings{MeetingPauseMinutes: pause}
	if zone.Valid {
		result.TimeZone = &zone.String
	}
	return result
}

func decodeWeek(data []byte) (Week, error) {
	var week Week
	if err := json.Unmarshal(data, &week); err != nil {
		return Week{}, fmt.Errorf("decode weekly availability: %w", err)
	}
	return week, nil
}
