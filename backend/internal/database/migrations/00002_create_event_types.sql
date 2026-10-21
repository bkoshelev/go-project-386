-- +goose Up
CREATE TABLE calendar_owner (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    full_name TEXT NOT NULL CHECK (length(btrim(full_name)) > 0)
);

INSERT INTO calendar_owner (full_name) VALUES ('Александр Иванов');

CREATE TABLE event_types (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    description TEXT,
    duration_minutes INTEGER NOT NULL CHECK (
        duration_minutes BETWEEN 1 AND 60 OR
        (duration_minutes BETWEEN 120 AND 1380 AND duration_minutes % 60 = 0)
    )
);

-- +goose Down
DROP TABLE event_types;
DROP TABLE calendar_owner;
