-- name: LockCalendar :one
SELECT singleton FROM scheduling_settings WHERE singleton = TRUE FOR UPDATE;

-- name: CreateBooking :one
INSERT INTO bookings (event_type_id, starts_at, ends_at, guest_name, guest_email)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: ListOwnerBookings :many
SELECT b.*, e.name AS event_type_name FROM bookings b
JOIN event_types e ON e.id = b.event_type_id
WHERE b.ends_at > $1 ORDER BY b.starts_at, b.id;

-- name: ListBusyBookings :many
SELECT starts_at, ends_at FROM bookings
WHERE ends_at > $1 AND starts_at < $2 ORDER BY starts_at;
