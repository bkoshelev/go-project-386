package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func (h applicationHandler) GetEventAvailability(ctx context.Context, request api.GetEventAvailabilityRequestObject) (api.GetEventAvailabilityResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	event, err := h.queries.GetEventType(ctx, pgtype.UUID{Bytes: request.EventTypeId, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return api.GetEventAvailability404JSONResponse{Code: api.GetEventAvailability404JSONResponseBodyCodeEventTypeNotFound, Message: "Тип события не найден"}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read event type: %w", err)
	}
	now := h.now().UTC()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	result := api.GetEventAvailability200JSONResponse{EventTypeId: request.EventTypeId, GeneratedAt: now, WindowStartsAt: start, WindowEndsAt: start.AddDate(0, 0, 14), Slots: []api.AvailableSlot{}}
	schedule, err := h.queries.GetAvailabilitySchedule(ctx)
	if err != nil {
		return nil, fmt.Errorf("read availability schedule: %w", err)
	}
	if !schedule.TimeZone.Valid {
		return result, nil
	}
	location, err := time.LoadLocation(schedule.TimeZone.String)
	if err != nil {
		return nil, fmt.Errorf("load schedule time zone: %w", err)
	}
	var week api.WeeklyAvailability
	if err := json.Unmarshal(schedule.WeeklyAvailability, &week); err != nil {
		return nil, fmt.Errorf("decode availability schedule: %w", err)
	}
	ranges := weeklyWorkingRanges(week, location, result.WindowStartsAt, result.WindowEndsAt)
	duration := time.Duration(event.DurationMinutes) * time.Minute
	for instant := now.Truncate(15 * time.Minute).Add(15 * time.Minute); !instant.Add(duration).After(result.WindowEndsAt); instant = instant.Add(15 * time.Minute) {
		for _, working := range ranges {
			if !instant.Before(working.StartsAt) && !instant.Add(duration).After(working.EndsAt) {
				result.Slots = append(result.Slots, api.AvailableSlot{StartsAt: instant, EndsAt: instant.Add(duration)})
				break
			}
		}
	}
	return result, nil
}

// Expand each affected owner-local date, then merge touching intervals, including midnight.
func weeklyWorkingRanges(week api.WeeklyAvailability, location *time.Location, start, end time.Time) []api.AvailableSlot {
	weekdays := []api.Weekday{api.Sunday, api.Monday, api.Tuesday, api.Wednesday, api.Thursday, api.Friday, api.Saturday}
	localStart := start.In(location)
	day := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, location)
	var ranges []api.AvailableSlot
	for ; day.Before(end); day = day.AddDate(0, 0, 1) {
		for _, settings := range week.Days {
			if settings.IsBlocked || settings.Weekday != weekdays[day.Weekday()] {
				continue
			}
			for _, interval := range settings.Intervals {
				ranges = append(ranges, api.AvailableSlot{StartsAt: localClock(day, interval.Start), EndsAt: localClock(day, interval.End)})
			}
		}
	}
	slices.SortFunc(ranges, func(a, b api.AvailableSlot) int { return a.StartsAt.Compare(b.StartsAt) })
	merged := make([]api.AvailableSlot, 0, len(ranges))
	for _, interval := range ranges {
		if len(merged) > 0 && !interval.StartsAt.After(merged[len(merged)-1].EndsAt) {
			if interval.EndsAt.After(merged[len(merged)-1].EndsAt) {
				merged[len(merged)-1].EndsAt = interval.EndsAt
			}
		} else {
			merged = append(merged, interval)
		}
	}
	return merged
}

func localClock(day time.Time, clock string) time.Time {
	// The saved schedule has already passed the contract's HH:mm validation.
	hour := int(clock[0]-'0')*10 + int(clock[1]-'0')
	minute := int(clock[3]-'0')*10 + int(clock[4]-'0')
	return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, day.Location()).UTC()
}
