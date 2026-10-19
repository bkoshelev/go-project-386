-- +goose Up
CREATE TABLE example_records (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    value TEXT NOT NULL
);

-- +goose Down
DROP TABLE example_records;
