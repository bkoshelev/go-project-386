package httpserver

import (
	"context"
	"errors"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/availability"
)

func (h applicationHandler) GetEventAvailability(ctx context.Context, request api.GetEventAvailabilityRequestObject) (api.GetEventAvailabilityResponseObject, error) {
	result, err := availability.Read(ctx, h.queries, request.EventTypeId, h.now())
	if errors.Is(err, availability.ErrEventTypeNotFound) {
		return api.GetEventAvailability404JSONResponse{Code: api.GetEventAvailability404JSONResponseBodyCodeEventTypeNotFound, Message: "Тип события не найден"}, nil
	}
	if err != nil {
		return nil, err
	}
	slots := make([]api.AvailableSlot, 0, len(result.Slots))
	for _, slot := range result.Slots {
		slots = append(slots, api.AvailableSlot{StartsAt: slot.StartsAt, EndsAt: slot.EndsAt})
	}
	return api.GetEventAvailability200JSONResponse{EventTypeId: request.EventTypeId, GeneratedAt: result.GeneratedAt, WindowStartsAt: result.WindowStartsAt, WindowEndsAt: result.WindowEndsAt, Slots: slots}, nil
}
