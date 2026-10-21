-- +goose Up
CREATE TABLE scheduling_settings (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE REFERENCES calendar_owner(singleton) CHECK (singleton),
    time_zone TEXT,
    meeting_pause_minutes INTEGER NOT NULL DEFAULT 0 CHECK (meeting_pause_minutes BETWEEN 0 AND 60),
    weekly_availability JSONB NOT NULL
);

INSERT INTO scheduling_settings (weekly_availability) VALUES ('{"days":[
    {"weekday":"monday","isBlocked":true,"intervals":[]},
    {"weekday":"tuesday","isBlocked":true,"intervals":[]},
    {"weekday":"wednesday","isBlocked":true,"intervals":[]},
    {"weekday":"thursday","isBlocked":true,"intervals":[]},
    {"weekday":"friday","isBlocked":true,"intervals":[]},
    {"weekday":"saturday","isBlocked":true,"intervals":[]},
    {"weekday":"sunday","isBlocked":true,"intervals":[]}
]}');

-- +goose Down
DROP TABLE scheduling_settings;
