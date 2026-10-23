-- +goose Up
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    event_type_id UUID NOT NULL REFERENCES event_types(id),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
    guest_name TEXT NOT NULL CHECK (char_length(guest_name) BETWEEN 1 AND 100),
    guest_email TEXT NOT NULL CHECK (char_length(guest_email) BETWEEN 1 AND 254),
    EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&)
);

-- +goose Down
DROP TABLE bookings;
