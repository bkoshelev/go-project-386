-- name: GetDateAvailability :one
SELECT time_zone, COALESCE(date_availability -> sqlc.arg(local_date)::text, '{"isBlocked":false}'::jsonb)::jsonb AS availability
FROM scheduling_settings WHERE singleton = TRUE;

-- name: UpdateDateAvailability :one
UPDATE scheduling_settings
SET date_availability = CASE
    WHEN sqlc.arg(availability)::jsonb = '{"isBlocked":false}'::jsonb
        THEN date_availability - sqlc.arg(local_date)::text
    ELSE jsonb_set(date_availability, ARRAY[sqlc.arg(local_date)::text], sqlc.arg(availability)::jsonb)
END
WHERE singleton = TRUE AND time_zone IS NOT NULL
RETURNING COALESCE(date_availability -> sqlc.arg(local_date)::text, '{"isBlocked":false}'::jsonb)::jsonb AS availability;
