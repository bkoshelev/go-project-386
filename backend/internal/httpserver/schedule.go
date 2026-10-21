package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func (h applicationHandler) GetSchedulingSettings(ctx context.Context, _ api.GetSchedulingSettingsRequestObject) (api.GetSchedulingSettingsResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.GetSchedulingSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("read scheduling settings: %w", err)
	}
	return api.GetSchedulingSettings200JSONResponse(schedulingSettings(row.TimeZone, row.MeetingPauseMinutes)), nil
}

func (h applicationHandler) InitializeScheduleTimeZone(ctx context.Context, request api.InitializeScheduleTimeZoneRequestObject) (api.InitializeScheduleTimeZoneResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.InitializeScheduleTimeZone(ctx, pgtype.Text{String: request.Body.TimeZone, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("initialize schedule time zone: %w", err)
	}
	return api.InitializeScheduleTimeZone200JSONResponse(schedulingSettings(row.TimeZone, row.MeetingPauseMinutes)), nil
}

func (h applicationHandler) GetWeeklyAvailability(ctx context.Context, _ api.GetWeeklyAvailabilityRequestObject) (api.GetWeeklyAvailabilityResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	data, err := h.queries.GetWeeklyAvailability(ctx)
	if err != nil {
		return nil, fmt.Errorf("read weekly availability: %w", err)
	}
	var week api.GetWeeklyAvailability200JSONResponse
	if err := json.Unmarshal(data, &week); err != nil {
		return nil, fmt.Errorf("decode weekly availability: %w", err)
	}
	return week, nil
}

func (h applicationHandler) UpdateWeeklyAvailability(ctx context.Context, request api.UpdateWeeklyAvailabilityRequestObject) (api.UpdateWeeklyAvailabilityResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	// Request validation guarantees each weekday appears exactly once; persist the contract order.
	weekdays := []api.Weekday{api.Monday, api.Tuesday, api.Wednesday, api.Thursday, api.Friday, api.Saturday, api.Sunday}
	slices.SortFunc(request.Body.Days, func(a, b api.WeekdayAvailability) int {
		return slices.Index(weekdays, a.Weekday) - slices.Index(weekdays, b.Weekday)
	})
	data, err := json.Marshal(request.Body)
	if err != nil {
		return nil, fmt.Errorf("encode weekly availability: %w", err)
	}
	saved, err := h.queries.UpdateWeeklyAvailability(ctx, data)
	if errors.Is(err, pgx.ErrNoRows) {
		return api.UpdateWeeklyAvailability409JSONResponse{
			Code:    api.UpdateWeeklyAvailability409JSONResponseBodyCodeScheduleNotInitialized,
			Message: "Сначала сохраните часовой пояс расписания",
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("replace weekly availability: %w", err)
	}
	var week api.UpdateWeeklyAvailability200JSONResponse
	if err := json.Unmarshal(saved, &week); err != nil {
		return nil, fmt.Errorf("decode saved weekly availability: %w", err)
	}
	return week, nil
}

func (h applicationHandler) UpdateSchedulingSettings(ctx context.Context, request api.UpdateSchedulingSettingsRequestObject) (api.UpdateSchedulingSettingsResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.UpdateSchedulingSettings(ctx, request.Body.MeetingPauseMinutes)
	if err != nil {
		return nil, fmt.Errorf("update scheduling settings: %w", err)
	}
	return api.UpdateSchedulingSettings200JSONResponse(schedulingSettings(row.TimeZone, row.MeetingPauseMinutes)), nil
}

func schedulingSettings(timeZone pgtype.Text, meetingPauseMinutes int32) api.SchedulingSettings {
	settings := api.SchedulingSettings{MeetingPauseMinutes: meetingPauseMinutes}
	if timeZone.Valid {
		settings.TimeZone = &timeZone.String
	}
	return settings
}
