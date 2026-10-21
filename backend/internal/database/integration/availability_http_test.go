//go:build !unit

package integration_test

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/bkoshelev/go-project-386/backend/internal/api"

	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/httpserver"
)

func TestAvailabilityIsEmptyUntilOwnerOpensHours(t *testing.T) {
	router, err := httpserver.NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", httpserver.Options{Database: testTransaction(t)})
	require.NoError(t, err)
	request := func(method, path string, body any) *httptest.ResponseRecorder {
		t.Helper()
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequestWithContext(t.Context(), method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	created := request(http.MethodPost, "/api/admin/event-types", map[string]any{"name": "Встреча", "durationMinutes": 30})
	require.Equal(t, http.StatusCreated, created.Code, created.Body.String())
	var event struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &event))
	path := "/api/event-types/" + event.ID + "/availability"
	response := request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `[]`, jsonField(t, response, "slots"))
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusOK, request(http.MethodPost, "/api/admin/scheduling-settings/time-zone", map[string]string{"timeZone": "UTC"}).Code)
	response = request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `[]`, jsonField(t, response, "slots"))
}

func jsonField(t *testing.T, response *httptest.ResponseRecorder, field string) string {
	t.Helper()
	var object map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &object))
	return string(object[field])
}

func TestAvailabilityOffersFutureUTCQuartersWithinFullDuration(t *testing.T) {
	now := time.Date(2026, 10, 19, 10, 2, 30, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	path := createAvailabilityType(t, request, 30)
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{
		"monday": {{Start: "10:30", End: "11:00"}, {Start: "10:07", End: "10:30"}},
	})
	response := request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `{
  "eventTypeId":"`+eventIDFromPath(path)+`",
  "generatedAt":"2026-10-19T10:02:30Z",
  "windowStartsAt":"2026-10-19T00:00:00Z",
  "windowEndsAt":"2026-11-02T00:00:00Z",
  "slots":[
   {"startsAt":"2026-10-19T10:15:00Z","endsAt":"2026-10-19T10:45:00Z"},
   {"startsAt":"2026-10-19T10:30:00Z","endsAt":"2026-10-19T11:00:00Z"},
   {"startsAt":"2026-10-26T10:15:00Z","endsAt":"2026-10-26T10:45:00Z"},
   {"startsAt":"2026-10-26T10:30:00Z","endsAt":"2026-10-26T11:00:00Z"}
  ]}`, response.Body.String())
	now = time.Date(2026, 10, 19, 10, 15, 0, 0, time.UTC)
	response = request(http.MethodGet, path, nil)
	var availability api.EventAvailability
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &availability))
	require.Len(t, availability.Slots, 3)
	require.Equal(t, "2026-10-19T10:30:00Z", availability.Slots[0].StartsAt.Format(time.RFC3339))
}

type availabilityRequest func(method, path string, body any) *httptest.ResponseRecorder

func availabilityHTTP(t *testing.T, now func() time.Time) availabilityRequest {
	t.Helper()
	router, err := httpserver.NewRouter(slog.New(slog.NewTextHandler(io.Discard, nil)), "test", httpserver.Options{Database: testTransaction(t), Now: now})
	require.NoError(t, err)
	return func(method, path string, body any) *httptest.ResponseRecorder {
		t.Helper()
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req := httptest.NewRequestWithContext(t.Context(), method, path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
}

func createAvailabilityType(t *testing.T, request availabilityRequest, duration int) string {
	t.Helper()
	response := request(http.MethodPost, "/api/admin/event-types", map[string]any{"name": "Встреча", "durationMinutes": duration})
	require.Equal(t, http.StatusCreated, response.Code, response.Body.String())
	var event struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &event))
	return "/api/event-types/" + event.ID + "/availability"
}

func eventIDFromPath(path string) string {
	return path[len("/api/event-types/") : len(path)-len("/availability")]
}

func openAvailabilityWeek(t *testing.T, request availabilityRequest, zone string, hours map[string][]api.AvailabilityTimeRange) {
	t.Helper()
	response := request(http.MethodPost, "/api/admin/scheduling-settings/time-zone", map[string]string{"timeZone": zone})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	week := api.WeeklyAvailability{Days: []api.WeekdayAvailability{}}
	for _, day := range []api.Weekday{api.Monday, api.Tuesday, api.Wednesday, api.Thursday, api.Friday, api.Saturday, api.Sunday} {
		intervals, open := hours[string(day)]
		if intervals == nil {
			intervals = []api.AvailabilityTimeRange{}
		}
		week.Days = append(week.Days, api.WeekdayAvailability{Weekday: day, IsBlocked: !open, Intervals: intervals})
	}
	response = request(http.MethodPut, "/api/admin/availability/weekly", week)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
}

func TestAvailabilityHonorsWindowEndAndEveryLocalDateAcrossMidnight(t *testing.T) {
	request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 10, 2, 0, 0, time.UTC) })
	path := createAvailabilityType(t, request, 60)
	hours := map[string][]api.AvailabilityTimeRange{
		"sunday": {{Start: "23:00", End: "24:00"}},
		"monday": {{Start: "00:00", End: "00:30"}},
	}
	openAvailabilityWeek(t, request, "UTC", hours)
	read := func() []api.AvailableSlot {
		t.Helper()
		response := request(http.MethodGet, path, nil)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var result api.EventAvailability
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
		return result.Slots
	}
	slots := read()
	data, err := json.Marshal(slots)
	require.NoError(t, err)
	require.JSONEq(t, `[
  {"startsAt":"2026-10-25T23:00:00Z","endsAt":"2026-10-26T00:00:00Z"},
  {"startsAt":"2026-10-25T23:15:00Z","endsAt":"2026-10-26T00:15:00Z"},
  {"startsAt":"2026-10-25T23:30:00Z","endsAt":"2026-10-26T00:30:00Z"},
  {"startsAt":"2026-11-01T23:00:00Z","endsAt":"2026-11-02T00:00:00Z"}
 ]`, string(data))
	// Blocking Monday removes its half hour, even though the start is on open Sunday.
	delete(hours, "monday")
	openAvailabilityWeek(t, request, "UTC", hours)
	slots = read()
	require.Len(t, slots, 2)
	require.Equal(t, "2026-10-25T23:00:00Z", slots[0].StartsAt.Format(time.RFC3339))
	require.Equal(t, "2026-11-01T23:00:00Z", slots[1].StartsAt.Format(time.RFC3339))
	// A one-minute gap also breaks continuity; it must not be treated as touching.
	hours["monday"] = []api.AvailabilityTimeRange{{Start: "00:01", End: "00:30"}}
	openAvailabilityWeek(t, request, "UTC", hours)
	require.Equal(t, slots, read())
	// Blocking the starting date removes the crossing slots too.
	delete(hours, "sunday")
	openAvailabilityWeek(t, request, "UTC", hours)
	require.Empty(t, read())
}

func TestAvailabilityConvertsWholeMoscowMondayAndKeepsUTCWindow(t *testing.T) {
	// The input clock's offset must not change which UTC date is today.
	now := time.Date(2026, 10, 19, 0, 2, 0, 0, time.FixedZone("clock", 3*60*60))
	request := availabilityHTTP(t, func() time.Time { return now })
	path := createAvailabilityType(t, request, 1380)
	openAvailabilityWeek(t, request, "Europe/Moscow", map[string][]api.AvailabilityTimeRange{
		"monday": {{Start: "00:00", End: "24:00"}},
	})
	response := request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `{
  "eventTypeId":"`+eventIDFromPath(path)+`",
  "generatedAt":"2026-10-18T21:02:00Z",
  "windowStartsAt":"2026-10-18T00:00:00Z",
  "windowEndsAt":"2026-11-01T00:00:00Z",
  "slots":[
   {"startsAt":"2026-10-18T21:15:00Z","endsAt":"2026-10-19T20:15:00Z"},
   {"startsAt":"2026-10-18T21:30:00Z","endsAt":"2026-10-19T20:30:00Z"},
   {"startsAt":"2026-10-18T21:45:00Z","endsAt":"2026-10-19T20:45:00Z"},
   {"startsAt":"2026-10-18T22:00:00Z","endsAt":"2026-10-19T21:00:00Z"},
   {"startsAt":"2026-10-25T21:00:00Z","endsAt":"2026-10-26T20:00:00Z"},
   {"startsAt":"2026-10-25T21:15:00Z","endsAt":"2026-10-26T20:15:00Z"},
   {"startsAt":"2026-10-25T21:30:00Z","endsAt":"2026-10-26T20:30:00Z"},
   {"startsAt":"2026-10-25T21:45:00Z","endsAt":"2026-10-26T20:45:00Z"},
   {"startsAt":"2026-10-25T22:00:00Z","endsAt":"2026-10-26T21:00:00Z"}
  ]}`, response.Body.String())
}

func TestAvailabilityRejectsUnknownAndMalformedTypeWithoutExposingData(t *testing.T) {
	request := availabilityHTTP(t, time.Now)
	for _, id := range []string{"00000000-0000-0000-0000-000000000000", "not-a-uuid"} {
		response := request(http.MethodGet, "/api/event-types/"+id+"/availability", nil)
		status, code := http.StatusNotFound, "event_type_not_found"
		if id == "not-a-uuid" {
			status, code = http.StatusBadRequest, "bad_request"
		}
		require.Equal(t, status, response.Code, response.Body.String())
		require.JSONEq(t, `"`+code+`"`, jsonField(t, response, "code"))
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	}
}

func TestAvailabilityCoversAllFourteenUTCDatesAndRecalculatesWithoutReservation(t *testing.T) {
	now := time.Date(2026, 10, 19, 10, 2, 0, 0, time.UTC)
	request := availabilityHTTP(t, func() time.Time { return now })
	path := createAvailabilityType(t, request, 1)
	hours := map[string][]api.AvailabilityTimeRange{}
	for _, day := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
		hours[day] = []api.AvailabilityTimeRange{{Start: "00:00", End: "24:00"}}
	}
	openAvailabilityWeek(t, request, "UTC", hours)
	response := request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	var availability api.EventAvailability
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &availability))
	// 14 full UTC dates, excluding the first 41 quarter-hours through 10:00 today.
	require.Len(t, availability.Slots, 1303)
	require.Equal(t, "2026-10-19T10:15:00Z", availability.Slots[0].StartsAt.Format(time.RFC3339))
	require.Equal(t, "2026-10-19T10:16:00Z", availability.Slots[0].EndsAt.Format(time.RFC3339))
	require.Equal(t, "2026-11-01T23:45:00Z", availability.Slots[1302].StartsAt.Format(time.RFC3339))
	require.Equal(t, "2026-11-01T23:46:00Z", availability.Slots[1302].EndsAt.Format(time.RFC3339))
	require.Equal(t, response.Body.String(), request(http.MethodGet, path, nil).Body.String(), "reading does not reserve slots")
	now = time.Date(2026, 10, 20, 0, 0, 0, 0, time.UTC)
	response = request(http.MethodGet, path, nil)
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &availability))
	require.Equal(t, "2026-10-20T00:00:00Z", availability.GeneratedAt.Format(time.RFC3339))
	require.Equal(t, "2026-10-20T00:00:00Z", availability.WindowStartsAt.Format(time.RFC3339))
	require.Equal(t, "2026-11-03T00:00:00Z", availability.WindowEndsAt.Format(time.RFC3339))
	require.Equal(t, "2026-10-20T00:15:00Z", availability.Slots[0].StartsAt.Format(time.RFC3339))
	openAvailabilityWeek(t, request, "UTC", nil)
	response = request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `[]`, jsonField(t, response, "slots"), "the next read observes closed hours")
}
