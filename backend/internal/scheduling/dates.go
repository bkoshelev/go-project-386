package scheduling

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

// ReadDate returns the explicit date setting, never merged with weekly hours.
func ReadDate(ctx context.Context, queries *db.Queries, date string) (Date, error) {
	if err := requireDatabase(queries); err != nil {
		return Date{}, err
	}
	row, err := queries.GetDateAvailability(ctx, date)
	if err != nil {
		return Date{}, fmt.Errorf("read date availability: %w", err)
	}
	if !row.TimeZone.Valid {
		return Date{}, ErrNotInitialized
	}
	return decodeDate(row.Availability)
}

// SaveDate atomically replaces an exception and clears custom hours when blocked.
// Inheritance removes the sparse entry instead of copying the weekly template.
func SaveDate(ctx context.Context, queries *db.Queries, date string, value Date) (Date, error) {
	if value.Intervals != nil {
		if fields := ValidateIntervals("/intervals", *value.Intervals); len(fields) > 0 {
			return Date{}, &ValidationError{Fields: fields}
		}
	}
	if value.IsBlocked {
		value.Intervals = nil
	}
	if err := requireDatabase(queries); err != nil {
		return Date{}, err
	}
	data, err := json.Marshal(value)
	if err != nil {
		return Date{}, fmt.Errorf("encode date availability: %w", err)
	}
	saved, err := queries.UpdateDateAvailability(ctx, db.UpdateDateAvailabilityParams{LocalDate: date, Availability: data})
	if errors.Is(err, pgx.ErrNoRows) {
		return Date{}, ErrNotInitialized
	}
	if err != nil {
		return Date{}, fmt.Errorf("save date availability: %w", err)
	}
	return decodeDate(saved)
}

func decodeDate(data []byte) (Date, error) {
	var value Date
	if err := json.Unmarshal(data, &value); err != nil {
		return Date{}, fmt.Errorf("decode date availability: %w", err)
	}
	return value, nil
}
