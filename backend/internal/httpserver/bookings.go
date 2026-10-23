package httpserver

import (
	"context"
	"errors"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/availability"
	"github.com/bkoshelev/go-project-386/backend/internal/booking"
	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

func (h applicationHandler) CreateBooking(ctx context.Context, request api.CreateBookingRequestObject) (api.CreateBookingResponseObject, error) {
	row, err := booking.Create(ctx, h.database, request.Body.EventTypeId, request.Body.StartsAt, request.Body.Guest.Name, string(request.Body.Guest.Email), h.now)
	if errors.Is(err, availability.ErrEventTypeNotFound) {
		return api.CreateBooking404JSONResponse{Code: api.CreateBooking404JSONResponseBodyCodeEventTypeNotFound, Message: "Тип события не найден"}, nil
	}
	var unavailable *booking.Unavailable
	if errors.As(err, &unavailable) {
		var response api.CreateBooking409JSONResponse
		if unavailable.Reason == availability.TimeOccupied {
			err = response.FromBookingTimeOccupied(api.BookingTimeOccupied{Code: api.BookingTimeOccupiedCodeTimeOccupied, Message: "Время уже занято"})
		} else {
			err = response.FromBookingTimeUnavailable(api.BookingTimeUnavailable{Code: "time_unavailable", Reason: api.BookingTimeUnavailableReason(unavailable.Reason), Message: "Выбранное время недоступно. Выберите другое время"})
		}
		return response, err
	}
	if err != nil {
		return nil, err
	}
	return api.CreateBooking201JSONResponse(confirmation(row)), nil
}

func (h applicationHandler) ListOwnerBookings(ctx context.Context, _ api.ListOwnerBookingsRequestObject) (api.ListOwnerBookingsResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	now := h.now().UTC()
	rows, err := h.queries.ListOwnerBookings(ctx, pgtype.Timestamptz{Time: now, Valid: true})
	if err != nil {
		return nil, err
	}
	items := make([]api.OwnerBooking, 0, len(rows))
	for _, row := range rows {
		c := confirmation(row)
		items = append(items, api.OwnerBooking{Id: c.Id, Status: api.OwnerBookingStatusConfirmed, EventTypeId: c.EventTypeId, EventTypeName: c.EventTypeName, StartsAt: c.StartsAt, EndsAt: c.EndsAt, Guest: api.BookingGuest{Name: row.GuestName, Email: openapi_types.Email(row.GuestEmail)}})
	}
	return api.ListOwnerBookings200JSONResponse{AsOf: now, Items: items}, nil
}

func confirmation(row db.ListOwnerBookingsRow) api.BookingConfirmation {
	return api.BookingConfirmation{Id: row.ID.Bytes, Status: api.BookingConfirmationStatusConfirmed, EventTypeId: row.EventTypeID.Bytes, EventTypeName: row.EventTypeName, StartsAt: row.StartsAt.Time.UTC(), EndsAt: row.EndsAt.Time.UTC()}
}
