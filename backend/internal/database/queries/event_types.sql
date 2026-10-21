-- name: GetCalendarOwner :one
SELECT full_name FROM calendar_owner WHERE singleton = TRUE;

-- name: ListEventTypes :many
SELECT id, name, description, duration_minutes FROM event_types ORDER BY id;

-- name: GetEventType :one
SELECT id, name, description, duration_minutes FROM event_types WHERE id = $1;

-- name: CreateEventType :one
INSERT INTO event_types (name, description, duration_minutes)
VALUES ($1, $2, $3)
RETURNING id, name, description, duration_minutes;
