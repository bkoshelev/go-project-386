package httpserver

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/scheduling"
)

func (h applicationHandler) GetSchedulingSettings(ctx context.Context, _ api.GetSchedulingSettingsRequestObject) (api.GetSchedulingSettingsResponseObject, error) {
	settings, err := scheduling.ReadSettings(ctx, h.queries)
	if err != nil {
		return nil, err
	}
	return api.GetSchedulingSettings200JSONResponse(settingsToAPI(settings)), nil
}

func (h applicationHandler) InitializeScheduleTimeZone(ctx context.Context, request api.InitializeScheduleTimeZoneRequestObject) (api.InitializeScheduleTimeZoneResponseObject, error) {
	settings, err := scheduling.InitializeTimeZone(ctx, h.queries, request.Body.TimeZone)
	var invalid *scheduling.ValidationError
	if errors.As(err, &invalid) {
		return api.InitializeScheduleTimeZone422JSONResponse(validationToAPI(invalid.Fields)), nil
	}
	if err != nil {
		return nil, err
	}
	return api.InitializeScheduleTimeZone200JSONResponse(settingsToAPI(settings)), nil
}

func (h applicationHandler) GetWeeklyAvailability(ctx context.Context, _ api.GetWeeklyAvailabilityRequestObject) (api.GetWeeklyAvailabilityResponseObject, error) {
	week, err := scheduling.ReadWeek(ctx, h.queries)
	if err != nil {
		return nil, err
	}
	return api.GetWeeklyAvailability200JSONResponse(weekToAPI(week)), nil
}

func (h applicationHandler) UpdateWeeklyAvailability(ctx context.Context, request api.UpdateWeeklyAvailabilityRequestObject) (api.UpdateWeeklyAvailabilityResponseObject, error) {
	week, err := scheduling.SaveWeek(ctx, h.queries, weekFromAPI(*request.Body))
	var invalid *scheduling.ValidationError
	if errors.As(err, &invalid) {
		return api.UpdateWeeklyAvailability422JSONResponse(validationToAPI(invalid.Fields)), nil
	}
	if errors.Is(err, scheduling.ErrNotInitialized) {
		return api.UpdateWeeklyAvailability409JSONResponse{Code: api.UpdateWeeklyAvailability409JSONResponseBodyCodeScheduleNotInitialized, Message: "Сначала сохраните часовой пояс расписания"}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateWeeklyAvailability200JSONResponse(weekToAPI(week)), nil
}

func (h applicationHandler) UpdateSchedulingSettings(ctx context.Context, request api.UpdateSchedulingSettingsRequestObject) (api.UpdateSchedulingSettingsResponseObject, error) {
	settings, err := scheduling.UpdatePause(ctx, h.queries, request.Body.MeetingPauseMinutes)
	if err != nil {
		return nil, err
	}
	return api.UpdateSchedulingSettings200JSONResponse(settingsToAPI(settings)), nil
}

func settingsToAPI(settings scheduling.Settings) api.SchedulingSettings {
	return api.SchedulingSettings{TimeZone: settings.TimeZone, MeetingPauseMinutes: settings.MeetingPauseMinutes}
}

func weekFromAPI(week api.WeeklyAvailability) scheduling.Week {
	result := scheduling.Week{Days: make([]scheduling.Day, 0, len(week.Days))}
	for _, day := range week.Days {
		intervals := make([]scheduling.Interval, 0, len(day.Intervals))
		for _, interval := range day.Intervals {
			intervals = append(intervals, scheduling.Interval{Start: interval.Start, End: interval.End})
		}
		result.Days = append(result.Days, scheduling.Day{Weekday: scheduling.Weekday(day.Weekday), IsBlocked: day.IsBlocked, Intervals: intervals})
	}
	return result
}

func weekToAPI(week scheduling.Week) api.WeeklyAvailability {
	result := api.WeeklyAvailability{Days: make([]api.WeekdayAvailability, 0, len(week.Days))}
	for _, day := range week.Days {
		intervals := make([]api.AvailabilityTimeRange, 0, len(day.Intervals))
		for _, interval := range day.Intervals {
			intervals = append(intervals, api.AvailabilityTimeRange{Start: interval.Start, End: interval.End})
		}
		result.Days = append(result.Days, api.WeekdayAvailability{Weekday: api.Weekday(day.Weekday), IsBlocked: day.IsBlocked, Intervals: intervals})
	}
	return result
}

func validationToAPI(fields []scheduling.Issue) api.ValidationError {
	return api.ValidationError{Code: api.ValidationErrorCodeValidationError, Message: "Проверьте данные формы", Fields: issuesToAPI(fields)}
}

func issuesToAPI(fields []scheduling.Issue) []api.FieldIssue {
	result := make([]api.FieldIssue, 0, len(fields))
	for _, field := range fields {
		result = append(result, issue(field.Field, api.FieldIssueCode(field.Code), field.Message))
	}
	return result
}

// The middleware has already checked the request schema before this conversion.
func schedulingRules(operation string, object map[string]any) []api.FieldIssue {
	switch operation {
	case "InitializeScheduleTimeZone":
		zone, _ := object["timeZone"].(string)
		return issuesToAPI(scheduling.ValidateTimeZone(zone))
	case "UpdateWeeklyAvailability":
		var week scheduling.Week
		data, err := json.Marshal(object)
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(data, &week); err != nil {
			return nil
		}
		return issuesToAPI(week.Validate())
	case "UpdateDateAvailability":
		var intervals []scheduling.Interval
		data, err := json.Marshal(object["intervals"])
		if err != nil {
			return nil
		}
		if err := json.Unmarshal(data, &intervals); err != nil {
			return nil
		}
		return issuesToAPI(scheduling.ValidateIntervals("/intervals", intervals))
	}
	return nil
}
