package httpserver

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

func (h applicationHandler) GetCalendarOwner(ctx context.Context, _ api.GetCalendarOwnerRequestObject) (api.GetCalendarOwnerResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	name, err := h.queries.GetCalendarOwner(ctx)
	if err != nil {
		return nil, fmt.Errorf("read calendar owner: %w", err)
	}
	return api.GetCalendarOwner200JSONResponse{FullName: name}, nil
}

func (h applicationHandler) ListEventTypes(ctx context.Context, _ api.ListEventTypesRequestObject) (api.ListEventTypesResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	rows, err := h.queries.ListEventTypes(ctx)
	if err != nil {
		return nil, fmt.Errorf("list event types: %w", err)
	}
	items := make([]api.EventType, 0, len(rows))
	for _, row := range rows {
		item, err := eventTypeResponse(row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return api.ListEventTypes200JSONResponse{Items: items}, nil
}

func eventTypeResponse(row db.EventType) (api.EventType, error) {
	item := api.EventType{Id: row.ID.Bytes, Name: row.Name}
	if row.Description.Valid {
		item.Description = &row.Description.String
	}
	if err := item.DurationMinutes.FromDurationUpToOneHour(row.DurationMinutes); err != nil {
		return api.EventType{}, fmt.Errorf("encode event duration: %w", err)
	}
	return item, nil
}

func (h applicationHandler) GetEventType(ctx context.Context, request api.GetEventTypeRequestObject) (api.GetEventTypeResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	row, err := h.queries.GetEventType(ctx, pgtype.UUID{Bytes: request.EventTypeId, Valid: true})
	if errors.Is(err, pgx.ErrNoRows) {
		return api.GetEventType404JSONResponse{
			Code:    api.GetEventType404JSONResponseBodyCodeEventTypeNotFound,
			Message: "Тип события не найден",
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read event type: %w", err)
	}
	item, err := eventTypeResponse(row)
	return api.GetEventType200JSONResponse(item), err
}

func (h applicationHandler) CreateEventType(ctx context.Context, request api.CreateEventTypeRequestObject) (api.CreateEventTypeResponseObject, error) {
	if h.queries == nil {
		return nil, errors.New("database is not configured")
	}
	body := request.Body
	minutes, err := body.DurationMinutes.AsDurationUpToOneHour()
	if err != nil {
		return nil, fmt.Errorf("decode normalized duration: %w", err)
	}
	description := pgtype.Text{}
	if body.Description != nil {
		description = pgtype.Text{String: *body.Description, Valid: true}
	}
	row, err := h.queries.CreateEventType(ctx, db.CreateEventTypeParams{
		Name: body.Name, Description: description, DurationMinutes: minutes,
	})
	if err != nil {
		return nil, fmt.Errorf("create event type: %w", err)
	}
	item, err := eventTypeResponse(row)
	return api.CreateEventType201JSONResponse(item), err
}
