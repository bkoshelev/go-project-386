-- +goose Up
ALTER TABLE event_types DROP CONSTRAINT event_types_duration_minutes_check;
ALTER TABLE event_types ADD CONSTRAINT event_types_duration_minutes_check CHECK (
    duration_minutes BETWEEN 1 AND 90 OR
    (duration_minutes BETWEEN 120 AND 1380 AND duration_minutes % 60 = 0)
);

-- +goose Down
ALTER TABLE event_types DROP CONSTRAINT event_types_duration_minutes_check;
ALTER TABLE event_types ADD CONSTRAINT event_types_duration_minutes_check CHECK (
    duration_minutes BETWEEN 1 AND 60 OR
    (duration_minutes BETWEEN 120 AND 1380 AND duration_minutes % 60 = 0)
);
