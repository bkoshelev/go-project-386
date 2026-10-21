package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func (h catalogHandler) GetSchedulingSettings(ctx context.Context, _ api.GetSchedulingSettingsRequestObject) (api.GetSchedulingSettingsResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.GetSchedulingSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("read scheduling settings: %w", err)
	}
	settings := api.GetSchedulingSettings200JSONResponse{MeetingPauseMinutes: row.MeetingPauseMinutes}
	if row.TimeZone.Valid {
		settings.TimeZone = &row.TimeZone.String
	}
	return settings, nil
}

func (h catalogHandler) InitializeScheduleTimeZone(ctx context.Context, request api.InitializeScheduleTimeZoneRequestObject) (api.InitializeScheduleTimeZoneResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.InitializeScheduleTimeZone(ctx, pgtype.Text{String: request.Body.TimeZone, Valid: true})
	if err != nil {
		return nil, fmt.Errorf("initialize schedule time zone: %w", err)
	}
	return api.InitializeScheduleTimeZone200JSONResponse{TimeZone: &row.TimeZone.String, MeetingPauseMinutes: row.MeetingPauseMinutes}, nil
}

func (h catalogHandler) GetWeeklyAvailability(ctx context.Context, _ api.GetWeeklyAvailabilityRequestObject) (api.GetWeeklyAvailabilityResponseObject, error) {
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

func (h catalogHandler) UpdateWeeklyAvailability(ctx context.Context, request api.UpdateWeeklyAvailabilityRequestObject) (api.UpdateWeeklyAvailabilityResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
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

func (h catalogHandler) UpdateSchedulingSettings(ctx context.Context, request api.UpdateSchedulingSettingsRequestObject) (api.UpdateSchedulingSettingsResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.UpdateSchedulingSettings(ctx, request.Body.MeetingPauseMinutes)
	if err != nil {
		return nil, fmt.Errorf("update scheduling settings: %w", err)
	}
	settings := api.UpdateSchedulingSettings200JSONResponse{MeetingPauseMinutes: row.MeetingPauseMinutes}
	if row.TimeZone.Valid {
		settings.TimeZone = &row.TimeZone.String
	}
	return settings, nil
}
