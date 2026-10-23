package httpserver

import (
	"context"
	"errors"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/scheduling"
)

func (h applicationHandler) GetDateAvailability(ctx context.Context, request api.GetDateAvailabilityRequestObject) (api.GetDateAvailabilityResponseObject, error) {
	value, err := scheduling.ReadDate(ctx, h.queries, request.Date.String())
	if errors.Is(err, scheduling.ErrNotInitialized) {
		return api.GetDateAvailability409JSONResponse{Code: api.GetDateAvailability409JSONResponseBodyCodeScheduleNotInitialized, Message: "Сначала сохраните часовой пояс расписания"}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.GetDateAvailability200JSONResponse(dateToAPI(request.Date, value)), nil
}

func (h applicationHandler) UpdateDateAvailability(ctx context.Context, request api.UpdateDateAvailabilityRequestObject) (api.UpdateDateAvailabilityResponseObject, error) {
	value := scheduling.Date{IsBlocked: request.Body.IsBlocked}
	if request.Body.Intervals != nil {
		intervals := make([]scheduling.Interval, 0, len(*request.Body.Intervals))
		for _, interval := range *request.Body.Intervals {
			intervals = append(intervals, scheduling.Interval{Start: interval.Start, End: interval.End})
		}
		value.Intervals = &intervals
	}
	saved, err := scheduling.SaveDate(ctx, h.queries, request.Date.String(), value)
	var invalid *scheduling.ValidationError
	if errors.As(err, &invalid) {
		return api.UpdateDateAvailability422JSONResponse(validationToAPI(invalid.Fields)), nil
	}
	if errors.Is(err, scheduling.ErrNotInitialized) {
		return api.UpdateDateAvailability409JSONResponse{Code: api.UpdateDateAvailability409JSONResponseBodyCodeScheduleNotInitialized, Message: "Сначала сохраните часовой пояс расписания"}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.UpdateDateAvailability200JSONResponse(dateToAPI(request.Date, saved)), nil
}

func dateToAPI(date openapi_types.Date, value scheduling.Date) api.DateAvailability {
	result := api.DateAvailability{Date: date, IsBlocked: value.IsBlocked}
	if value.Intervals != nil {
		intervals := make([]api.AvailabilityTimeRange, 0, len(*value.Intervals))
		for _, interval := range *value.Intervals {
			intervals = append(intervals, api.AvailabilityTimeRange{Start: interval.Start, End: interval.End})
		}
		result.Intervals = &intervals
	}
	return result
}
