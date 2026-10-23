-- +goose Up
ALTER TABLE scheduling_settings
ADD COLUMN date_availability JSONB NOT NULL DEFAULT '{}'::jsonb;

-- +goose Down
ALTER TABLE scheduling_settings DROP COLUMN date_availability;
