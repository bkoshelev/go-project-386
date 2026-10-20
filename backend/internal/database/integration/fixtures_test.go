//go:build !unit

package integration_test

import (
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/database/db"
)

func TestExampleRecordFixtureCanBeRead(t *testing.T) {
	var id pgtype.UUID
	require.NoError(t, id.Scan("019a039a-7000-7000-8000-000000000001"))

	record, err := db.New(testTransaction(t)).GetExampleRecord(t.Context(), id)
	require.NoError(t, err)
	assert.Equal(t, id, record.ID)
	assert.Equal(t, "loaded from YAML fixture", record.Value)
}
