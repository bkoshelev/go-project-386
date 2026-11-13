//go:build !unit

package integration_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

func TestMeetingPauseExactBoundariesAcrossEventTypes(t *testing.T) {
	for _, example := range []struct {
		name                    string
		pause                   int
		beforeSame, beforeOther string
		after                   string
	}{
		{"zero", 0, "09:30", "09:45", "10:30"},
		{"fifteen", 15, "09:15", "09:30", "10:45"},
		{"sixty", 60, "08:30", "08:45", "11:30"},
	} {
		for _, differentType := range []bool{false, true} {
			name := example.name + "/same_type"
			if differentType {
				name = example.name + "/different_types"
			}
			t.Run(name, func(t *testing.T) {
				request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC) })
				busyPath := createAvailabilityType(t, request, 30)
				probePath, before := busyPath, example.beforeSame
				if differentType {
					probePath, before = createAvailabilityType(t, request, 15), example.beforeOther
				}
				openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{"tuesday": {{Start: "00:00", End: "24:00"}}})
				require.Equal(t, 201, request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(busyPath), "2026-10-20T10:00:00Z")).Code)
				require.Equal(t, 200, request(http.MethodPut, "/api/admin/scheduling-settings", map[string]int{"meetingPauseMinutes": example.pause}).Code)
				response := request(http.MethodGet, probePath, nil)
				require.Equal(t, 200, response.Code, response.Body.String())
				var available api.EventAvailability
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &available))
				starts := make([]string, 0, len(available.Slots))
				for _, slot := range available.Slots {
					starts = append(starts, slot.StartsAt.Format(time.RFC3339))
				}
				for _, clock := range []string{before, example.after} {
					require.Contains(t, starts, "2026-10-20T"+clock+":00Z")
				}
				require.NotContains(t, starts, "2026-10-20T10:15:00Z")
				if example.pause > 0 {
					require.NotContains(t, starts, "2026-10-20T10:30:00Z")
				}
				for _, candidate := range []struct {
					clock string
					step  time.Duration
				}{{before, time.Minute}, {example.after, -time.Minute}} {
					boundary, err := time.Parse(time.RFC3339, "2026-10-20T"+candidate.clock+":00Z")
					require.NoError(t, err)
					response := request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(probePath), boundary.Add(candidate.step).Format(time.RFC3339)))
					require.Equal(t, 409, response.Code, response.Body.String())
					require.JSONEq(t, `"time_occupied"`, jsonField(t, response, "code"))
					response = request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(probePath), boundary.Format(time.RFC3339)))
					require.Equal(t, 201, response.Code, response.Body.String())
				}
			})
		}
	}
}

func TestMeetingPauseAcrossMidnightUsesBusyBookingsBeforeWindow(t *testing.T) {
	now := time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	path := createAvailabilityType(t, request, 15)
	openAvailabilityWeek(t, request, "Europe/Moscow", map[string][]api.AvailabilityTimeRange{
		"sunday": {{Start: "00:00", End: "24:00"}},
		"monday": {{Start: "00:00", End: "24:00"}},
	})
	// The first pair straddles owner midnight, the second the UTC window boundary.
	for _, start := range []string{"2026-10-18T20:45:00Z", "2026-10-18T23:45:00Z"} {
		require.Equal(t, 201, request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), start)).Code)
	}
	require.Equal(t, 200, request(http.MethodPut, "/api/admin/scheduling-settings", map[string]int{"meetingPauseMinutes": 60}).Code)
	for _, pair := range [][2]string{{"2026-10-18T21:59:00Z", "2026-10-18T22:00:00Z"}, {"2026-10-19T00:59:00Z", "2026-10-19T01:00:00Z"}} {
		if pair[0] == "2026-10-19T00:59:00Z" {
			now = time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
		}
		bad := request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), pair[0]))
		require.Equal(t, 409, bad.Code, bad.Body.String())
		require.JSONEq(t, `"time_occupied"`, jsonField(t, bad, "code"))
		good := request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), pair[1]))
		require.Equal(t, 201, good.Code, good.Body.String())
	}
	response := request(http.MethodGet, path, nil)
	require.Equal(t, 200, response.Code, response.Body.String())
	var available api.EventAvailability
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &available))
	for _, slot := range available.Slots {
		require.NotEqual(t, "2026-10-19T00:15:00Z", slot.StartsAt.Format(time.RFC3339))
	}
}

func TestMeetingPauseIncludesBusyBookingAfterWindowEnd(t *testing.T) {
	now := time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	path := createAvailabilityType(t, request, 15)
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{
		"sunday": {{Start: "23:00", End: "24:00"}},
		"monday": {{Start: "00:00", End: "01:00"}},
	})
	require.Equal(t, 201, request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), "2026-11-02T00:00:00Z")).Code)
	require.Equal(t, 200, request(http.MethodPut, "/api/admin/scheduling-settings", map[string]int{"meetingPauseMinutes": 15}).Code)
	// Moving the clock back makes the saved meeting start at the excluded window boundary.
	now = time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	response := request(http.MethodGet, path, nil)
	require.Equal(t, 200, response.Code, response.Body.String())
	var available api.EventAvailability
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &available))
	starts := make([]string, 0, len(available.Slots))
	for _, slot := range available.Slots {
		starts = append(starts, slot.StartsAt.Format(time.RFC3339))
	}
	require.Contains(t, starts, "2026-11-01T23:30:00Z")
	require.NotContains(t, starts, "2026-11-01T23:45:00Z")
	bad := request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), "2026-11-01T23:31:00Z"))
	require.Equal(t, 409, bad.Code, bad.Body.String())
	require.JSONEq(t, `"time_occupied"`, jsonField(t, bad, "code"))
	good := request(http.MethodPost, "/api/bookings", bookingBody(eventIDFromPath(path), "2026-11-01T23:30:00Z"))
	require.Equal(t, 201, good.Code, good.Body.String())
}
