package api

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedContractIsComplete(t *testing.T) {
	schema, err := GetSpec()
	require.NoError(t, err)
	require.NoError(t, schema.Validate(t.Context()))
	operations := []string{}
	for _, path := range schema.Paths.Map() {
		for _, operation := range path.Operations() {
			operations = append(operations, operation.OperationID)
		}
	}
	require.Len(t, operations, 16)
	require.Contains(t, operations, "CreateBooking")
	require.Contains(t, operations, "GetHealth")
	require.Contains(t, schema.Components.Schemas, "OwnerBooking")
	require.Contains(t, schema.Components.Schemas, "UpdateDateAvailabilityRequest")
}

func TestGeneratedDurationUnionIsJSONNumber(t *testing.T) {
	for _, minutes := range []int32{1, 30, 60, 120, 1380} {
		var duration EventTypeDurationMinutes
		if minutes <= 60 {
			require.NoError(t, duration.FromDurationUpToOneHour(minutes))
		} else {
			require.NoError(t, duration.FromEventTypeDurationMinutes1(EventTypeDurationMinutes1(minutes)))
		}
		event := EventType{Id: uuid.MustParse("019a0ac0-1234-7abc-8def-0123456789ab"), Name: "Call", DurationMinutes: duration}
		encoded, err := json.Marshal(event)
		require.NoError(t, err)
		var object map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(encoded, &object))
		require.JSONEq(t, fmt.Sprint(minutes), string(object["durationMinutes"]))
		var decoded EventType
		require.NoError(t, json.Unmarshal(encoded, &decoded))
		require.Equal(t, event, decoded)
	}
}

func TestGeneratedInheritanceStaysFlat(t *testing.T) {
	start := time.Date(2026, 10, 20, 10, 7, 0, 0, time.FixedZone("offset", 3*60*60)).UTC()
	id := uuid.MustParse("019a0ac0-1234-7abc-8def-0123456789ab")
	booking := OwnerBooking{Id: id, EventTypeId: id, EventTypeName: "Call", Status: OwnerBookingStatusConfirmed, StartsAt: start, EndsAt: start.Add(30 * time.Minute), Guest: BookingGuest{Name: "Anna", Email: types.Email("anna@example.com")}}
	encoded, err := json.Marshal(booking)
	require.NoError(t, err)
	require.JSONEq(t, `{"id":"019a0ac0-1234-7abc-8def-0123456789ab","eventTypeId":"019a0ac0-1234-7abc-8def-0123456789ab","eventTypeName":"Call","status":"confirmed","startsAt":"2026-10-20T07:07:00Z","endsAt":"2026-10-20T07:37:00Z","guest":{"name":"Anna","email":"anna@example.com"}}`, string(encoded))
}

func TestGeneratedOptionalIntervalsPreservePresence(t *testing.T) {
	for _, body := range []string{`{"isBlocked":false}`, `{"isBlocked":false,"intervals":[]}`} {
		var request UpdateDateAvailabilityRequest
		require.NoError(t, json.Unmarshal([]byte(body), &request))
		encoded, err := json.Marshal(request)
		require.NoError(t, err)
		require.JSONEq(t, body, string(encoded))
	}
}
