//go:build !unit

package integration_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func bookingBody(id, start string) map[string]any {
	return map[string]any{"eventTypeId": id, "startsAt": start, "guest": map[string]string{"name": " Анна ", "email": " anna@example.com "}}
}

func TestBookingUsesCurrentRulesInContractPriorityOrder(t *testing.T) {
	now := time.Date(2026, 10, 19, 10, 2, 0, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	id := eventIDFromPath(createAvailabilityType(t, request, 30))
	send := func(start string, status int, reason string) {
		t.Helper()
		response := request(http.MethodPost, "/api/bookings", bookingBody(id, start))
		require.Equal(t, status, response.Code, response.Body.String())
		if reason != "" {
			require.JSONEq(t, `"`+reason+`"`, jsonField(t, response, "reason"))
		}
	}
	send("2026-10-18T10:00:00Z", 409, "schedule_not_initialized")
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{"monday": {{Start: "10:00", End: "12:00"}}})
	send("2026-10-19T10:02:00Z", 409, "starts_in_past")
	send("2026-11-02T10:00:00Z", 409, "outside_booking_window")
	send("2026-10-19T12:00:00Z", 409, "outside_working_hours")
	// A selected start is not reserved; only the actual write occupies it.
	send("2026-10-19T10:15:00Z", 201, "")
	occupied := request(http.MethodPost, "/api/bookings", bookingBody(id, "2026-10-19T10:15:00Z"))
	require.Equal(t, 409, occupied.Code, occupied.Body.String())
	require.JSONEq(t, `"time_occupied"`, jsonField(t, occupied, "code"))
	// Closing hours outranks occupation, and doesn't remove the saved meeting.
	openAvailabilityWeek(t, request, "UTC", nil)
	send("2026-10-19T10:15:00Z", 409, "outside_working_hours")
	list := request(http.MethodGet, "/api/admin/bookings", nil)
	var result api.OwnerBookings
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &result))
	require.Len(t, result.Items, 1)
	require.Equal(t, "Анна", result.Items[0].Guest.Name)
	// A start that elapsed after selection is checked again at write time.
	now = time.Date(2026, 10, 19, 10, 15, 0, 0, time.UTC)
	send("2026-10-19T10:15:00Z", 409, "starts_in_past")
}

func TestBookingValidationPrecedesAvailabilityAndNormalizesContacts(t *testing.T) {
	request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 10, 2, 0, 0, time.UTC) })
	id := eventIDFromPath(createAvailabilityType(t, request, 30))
	for _, test := range []struct{ name, email, field string }{
		{" ", "a@example.com", "/guest/name"},
		{strings.Repeat("я", 101), "a@example.com", "/guest/name"},
		{"Анна", " ", "/guest/email"},
		{"Анна", "not-an-email", "/guest/email"},
		{"Анна", strings.Repeat("a", 245) + "@example.com", "/guest/email"},
	} {
		body := bookingBody(id, "2026-10-18T10:00:00Z")
		body["guest"] = map[string]string{"name": test.name, "email": test.email}
		response := request(http.MethodPost, "/api/bookings", body)
		require.Equal(t, 422, response.Code, response.Body.String())
		var failure api.ValidationError
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &failure))
		require.Condition(t, func() bool {
			for _, field := range failure.Fields {
				if field.Field == test.field {
					return true
				}
			}
			return false
		}, response.Body.String())
	}
	// Unknown type is evaluated before calendar rules, after field validation.
	response := request(http.MethodPost, "/api/bookings", bookingBody("00000000-0000-0000-0000-000000000000", "2026-10-18T10:00:00Z"))
	require.Equal(t, 404, response.Code, response.Body.String())
	// Exact accepted Unicode name and email length boundaries.
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{"monday": {{Start: "10:00", End: "12:00"}}})
	body := bookingBody(id, "2026-10-19T10:07:00+00:00")
	email := strings.Repeat("a", 64) + "@" + strings.Repeat("b", 63) + "." + strings.Repeat("c", 63) + "." + strings.Repeat("d", 61)
	require.Len(t, email, 254)
	body["guest"] = map[string]string{"name": " " + strings.Repeat("я", 100) + " ", "email": " " + email + " "}
	response = request(http.MethodPost, "/api/bookings", body)
	require.Equal(t, 201, response.Code, response.Body.String())
	list := request(http.MethodGet, "/api/admin/bookings", nil)
	var result api.OwnerBookings
	require.NoError(t, json.Unmarshal(list.Body.Bytes(), &result))
	require.Len(t, result.Items, 1)
	require.Equal(t, strings.Repeat("я", 100), result.Items[0].Guest.Name)
	require.Equal(t, email, string(result.Items[0].Guest.Email))
	require.Equal(t, "2026-10-19T10:37:00Z", result.Items[0].EndsAt.Format(time.RFC3339))
}

func TestOwnerBookingsAreCompleteSortedAndFilteredByEndAtServerAsOf(t *testing.T) {
	now := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	id := eventIDFromPath(createAvailabilityType(t, request, 15))
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{"monday": {{Start: "00:00", End: "24:00"}}})
	for index := 25; index >= 1; index-- {
		start := now.Add(time.Duration(index) * 15 * time.Minute)
		response := request(http.MethodPost, "/api/bookings", bookingBody(id, start.Format(time.RFC3339)))
		require.Equal(t, 201, response.Code, response.Body.String())
	}
	read := func() api.OwnerBookings {
		t.Helper()
		response := request(http.MethodGet, "/api/admin/bookings", nil)
		require.Equal(t, 200, response.Code, response.Body.String())
		var list api.OwnerBookings
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &list))
		require.Equal(t, now, list.AsOf)
		return list
	}
	list := read()
	require.Len(t, list.Items, 25)
	for i := 1; i < len(list.Items); i++ {
		require.True(t, list.Items[i-1].StartsAt.Before(list.Items[i].StartsAt))
	}
	now = now.Add(20 * time.Minute)
	require.Len(t, read().Items, 25, "started booking remains visible")
	now = time.Date(2026, 10, 19, 0, 30, 0, 0, time.UTC)
	list = read()
	require.Len(t, list.Items, 24, "end equal to asOf is excluded")
	require.Equal(t, now, list.Items[0].StartsAt)
	// Move server time backwards to prove the owner list has no guest-window restriction.
	now = now.AddDate(0, 0, -20)
	require.Len(t, read().Items, 25)
}
