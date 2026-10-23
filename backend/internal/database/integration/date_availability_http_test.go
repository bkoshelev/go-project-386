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

func TestDateHoursReplaceWeekAndReadExplicitSetting(t *testing.T) {
	request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC) })
	path := createAvailabilityType(t, request, 60)
	openAvailabilityWeek(t, request, "UTC", map[string][]api.AvailabilityTimeRange{"monday": {{Start: "09:00", End: "18:00"}}})
	datePath := "/api/admin/availability/dates/2026-10-19"
	response := request(http.MethodGet, datePath, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `{"date":"2026-10-19","isBlocked":false}`, response.Body.String())
	response = request(http.MethodPut, datePath, map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "12:00", "end": "14:00"}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.JSONEq(t, `{"date":"2026-10-19","isBlocked":false,"intervals":[{"start":"12:00","end":"14:00"}]}`, response.Body.String())
	require.JSONEq(t, response.Body.String(), request(http.MethodGet, datePath, nil).Body.String())
	var availability api.EventAvailability
	response = request(http.MethodGet, path, nil)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &availability))
	var today []api.AvailableSlot
	for _, slot := range availability.Slots {
		if slot.StartsAt.Format(time.DateOnly) == "2026-10-19" {
			today = append(today, slot)
		}
	}
	data, err := json.Marshal(today)
	require.NoError(t, err)
	require.JSONEq(t, `[
 {"startsAt":"2026-10-19T12:00:00Z","endsAt":"2026-10-19T13:00:00Z"},
 {"startsAt":"2026-10-19T12:15:00Z","endsAt":"2026-10-19T13:15:00Z"},
 {"startsAt":"2026-10-19T12:30:00Z","endsAt":"2026-10-19T13:30:00Z"},
 {"startsAt":"2026-10-19T12:45:00Z","endsAt":"2026-10-19T13:45:00Z"},
 {"startsAt":"2026-10-19T13:00:00Z","endsAt":"2026-10-19T14:00:00Z"}]`, string(data))
}

func TestDateInheritanceEmptyHoursAndBlockingHaveDistinctEffects(t *testing.T) {
	request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC) })
	path := createAvailabilityType(t, request, 60)
	hours := map[string][]api.AvailabilityTimeRange{"monday": {{Start: "09:00", End: "18:00"}}}
	openAvailabilityWeek(t, request, "UTC", hours)
	datePath := "/api/admin/availability/dates/2026-10-19"
	readStarts := func() []string {
		t.Helper()
		response := request(http.MethodGet, path, nil)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var value api.EventAvailability
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &value))
		starts := []string{}
		for _, slot := range value.Slots {
			if slot.StartsAt.Format(time.DateOnly) == "2026-10-19" {
				starts = append(starts, slot.StartsAt.Format("15:04"))
			}
		}
		return starts
	}
	initial := readStarts()
	require.Len(t, initial, 33)
	require.Equal(t, "09:00", initial[0])
	require.Equal(t, "17:00", initial[32])
	for _, step := range []struct {
		body     string
		explicit string
		count    int
	}{
		{`{"isBlocked":false,"intervals":[]}`, `{"date":"2026-10-19","isBlocked":false,"intervals":[]}`, 0},
		{`{"isBlocked":false}`, `{"date":"2026-10-19","isBlocked":false}`, 33},
		{`{"isBlocked":false,"intervals":[{"start":"12:00","end":"14:00"}]}`, `{"date":"2026-10-19","isBlocked":false,"intervals":[{"start":"12:00","end":"14:00"}]}`, 5},
		{`{"isBlocked":true,"intervals":[{"start":"09:00","end":"18:00"}]}`, `{"date":"2026-10-19","isBlocked":true}`, 0},
		{`{"isBlocked":false}`, `{"date":"2026-10-19","isBlocked":false}`, 33},
	} {
		var body any
		require.NoError(t, json.Unmarshal([]byte(step.body), &body))
		response := request(http.MethodPut, datePath, body)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.JSONEq(t, step.explicit, response.Body.String())
		require.JSONEq(t, step.explicit, request(http.MethodGet, datePath, nil).Body.String())
		require.Len(t, readStarts(), step.count)
	}
	// Weekly edits remain live for inheriting dates rather than copied into each date.
	hours["monday"] = []api.AvailabilityTimeRange{{Start: "10:00", End: "11:00"}}
	openAvailabilityWeek(t, request, "UTC", hours)
	require.Equal(t, []string{"10:00"}, readStarts())
	// An explicit open date never overrides a blocked weekday.
	response := request(http.MethodPut, datePath, map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "12:00", "end": "14:00"}}})
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	openAvailabilityWeek(t, request, "UTC", nil)
	require.Empty(t, readStarts())
	require.JSONEq(t, `{"date":"2026-10-19","isBlocked":false,"intervals":[{"start":"12:00","end":"14:00"}]}`, request(http.MethodGet, datePath, nil).Body.String())
}

func TestDateExceptionsApplyToBothLocalDatesAcrossMidnight(t *testing.T) {
	request := availabilityHTTP(t, func() time.Time { return time.Date(2026, 10, 19, 8, 0, 0, 0, time.UTC) })
	path := createAvailabilityType(t, request, 60)
	openAvailabilityWeek(t, request, "Europe/Moscow", map[string][]api.AvailabilityTimeRange{
		"monday": {{Start: "23:30", End: "24:00"}}, "tuesday": {{Start: "00:00", End: "00:30"}},
	})
	read := func() string {
		t.Helper()
		response := request(http.MethodGet, path, nil)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		return jsonField(t, response, "slots")
	}
	require.JSONEq(t, `[
 {"startsAt":"2026-10-19T20:30:00Z","endsAt":"2026-10-19T21:30:00Z"},
 {"startsAt":"2026-10-26T20:30:00Z","endsAt":"2026-10-26T21:30:00Z"}]`, read())
	for _, date := range []string{"2026-10-19", "2026-10-20"} {
		datePath := "/api/admin/availability/dates/" + date
		require.Equal(t, http.StatusOK, request(http.MethodPut, datePath, map[string]any{"isBlocked": true}).Code)
		require.JSONEq(t, `[{"startsAt":"2026-10-26T20:30:00Z","endsAt":"2026-10-26T21:30:00Z"}]`, read())
		require.Equal(t, http.StatusOK, request(http.MethodPut, datePath, map[string]any{"isBlocked": false}).Code)
	}
	// A gap introduced after local midnight also removes the slot starting the previous date.
	require.Equal(t, http.StatusOK, request(http.MethodPut, "/api/admin/availability/dates/2026-10-20", map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "00:01", "end": "00:30"}}}).Code)
	require.JSONEq(t, `[{"startsAt":"2026-10-26T20:30:00Z","endsAt":"2026-10-26T21:30:00Z"}]`, read())
}

func TestDateValidationMatchesWeekAndDoesNotChangeSavedSetting(t *testing.T) {
	request := availabilityHTTP(t, time.Now)
	datePath := "/api/admin/availability/dates/2026-10-19"
	for _, method := range []string{http.MethodGet, http.MethodPut} {
		response := request(method, datePath, map[string]any{"isBlocked": false})
		require.Equal(t, http.StatusConflict, response.Code, response.Body.String())
		require.JSONEq(t, `"schedule_not_initialized"`, jsonField(t, response, "code"))
	}
	openAvailabilityWeek(t, request, "UTC", nil)
	valid := map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "00:00", "end": "12:00"}, {"start": "12:00", "end": "24:00"}}}
	response := request(http.MethodPut, datePath, valid)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	saved := response.Body.String()
	for _, test := range []struct {
		body        any
		field, code string
	}{
		{map[string]any{}, "/isBlocked", "required"},
		{map[string]any{"isBlocked": false, "extra": true}, "/extra", "unknown_field"},
		{map[string]any{"isBlocked": false, "intervals": nil}, "/intervals", "invalid_format"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "24:00", "end": "24:00"}}}, "/intervals/0/start", "invalid_format"},
		{map[string]any{"isBlocked": true, "intervals": []map[string]string{{"start": "09:00", "end": "09:00"}}}, "/intervals/0/end", "invalid_interval"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "18:00", "end": "09:00"}}}, "/intervals/0/end", "invalid_interval"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "9:00", "end": "18:00"}}}, "/intervals/0/start", "invalid_format"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "09:00", "end": "24:01"}}}, "/intervals/0/end", "invalid_format"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "09:00", "end": "18:00", "extra": "x"}}}, "/intervals/0/extra", "unknown_field"},
		{map[string]any{"isBlocked": false, "intervals": []map[string]string{{"start": "09:00", "end": "18:00"}, {"start": "12:00", "end": "13:00"}}}, "/intervals/1/start", "overlapping_intervals"},
	} {
		response = request(http.MethodPut, datePath, test.body)
		require.Equal(t, http.StatusUnprocessableEntity, response.Code, response.Body.String())
		var body api.ValidationError
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
		require.Contains(t, body.Fields, api.FieldIssue{Field: test.field, Code: api.FieldIssueCode(test.code), Message: findIssueMessage(body.Fields, test.field)})
		require.JSONEq(t, saved, request(http.MethodGet, datePath, nil).Body.String())
	}
	for _, date := range []string{"2026-02-30", "2026-13-01", "not-a-date", "2026-1-01"} {
		for _, method := range []string{http.MethodGet, http.MethodPut} {
			response = request(method, "/api/admin/availability/dates/"+date, map[string]any{"isBlocked": false})
			require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
		}
	}
}

func findIssueMessage(fields []api.FieldIssue, path string) string {
	for _, field := range fields {
		if field.Field == path {
			return field.Message
		}
	}
	return "missing issue"
}
