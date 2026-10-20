-- name: CreateExampleRecord :one
INSERT INTO example_records (value)
VALUES ($1)
RETURNING id, value;

-- name: GetExampleRecord :one
SELECT id, value
FROM example_records
WHERE id = $1;
