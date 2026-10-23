-- name: GetSchedulingSettings :one
SELECT time_zone, meeting_pause_minutes FROM scheduling_settings WHERE singleton = TRUE;

-- name: InitializeScheduleTimeZone :one
UPDATE scheduling_settings SET time_zone = COALESCE(time_zone, $1)
WHERE singleton = TRUE
RETURNING time_zone, meeting_pause_minutes;

-- name: GetWeeklyAvailability :one
SELECT weekly_availability FROM scheduling_settings WHERE singleton = TRUE;

-- name: UpdateWeeklyAvailability :one
UPDATE scheduling_settings SET weekly_availability = $1
WHERE singleton = TRUE AND time_zone IS NOT NULL
RETURNING weekly_availability;

-- name: UpdateSchedulingSettings :one
UPDATE scheduling_settings SET meeting_pause_minutes = $1
WHERE singleton = TRUE
RETURNING time_zone, meeting_pause_minutes;

-- name: GetAvailabilitySchedule :one
SELECT time_zone, weekly_availability, meeting_pause_minutes, date_availability FROM scheduling_settings WHERE singleton = TRUE;
