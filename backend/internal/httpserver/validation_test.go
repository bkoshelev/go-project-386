package httpserver

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

const eventID = "019a0ac0-1234-7abc-8def-0123456789ab"

func TestRequestValidation(t *testing.T) {
	booking := func(start, guest string) string {
		return fmt.Sprintf(`{"eventTypeId":%q,"startsAt":%q,"guest":%s}`, eventID, start, guest)
	}
	guest := `{"name":"Анна","email":"anna@example.com"}`
	tests := []struct {
		name, method, path, body string
		status                   int
		field                    string
		code                     api.FieldIssueCode
	}{
		{name: "malformed JSON", method: "POST", path: "/api/bookings", body: `{"guest":`, status: 400},
		{name: "empty body", method: "POST", path: "/api/bookings", status: 400},
		{name: "trailing JSON", method: "POST", path: "/api/bookings", body: `{} {}`, status: 400},
		{name: "null root", method: "POST", path: "/api/bookings", body: `null`, status: 422, field: "", code: api.InvalidFormat},
		{name: "missing guest", method: "POST", path: "/api/bookings", body: `{}`, status: 422, field: "/guest", code: api.Required},
		{name: "null guest", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", "null"), status: 422, field: "/guest", code: api.InvalidFormat},
		{name: "unknown nested field", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":"Анна","email":"anna@example.com","secret/key~":1}`), status: 422, field: "/guest/secret~1key~0", code: api.UnknownField},
		{name: "wrong name type", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":42,"email":"anna@example.com"}`), status: 422, field: "/guest/name", code: api.InvalidFormat},
		{name: "blank trimmed name", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":"  ","email":"anna@example.com"}`), status: 422, field: "/guest/name", code: api.OutOfRange},
		{name: "invalid email", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":"Анна","email":"bad"}`), status: 422, field: "/guest/email", code: api.InvalidFormat},
		{name: "display name email", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":"Анна","email":"Anna <anna@example.com>"}`), status: 422, field: "/guest/email", code: api.InvalidFormat},
		{name: "bad body UUID", method: "POST", path: "/api/bookings", body: `{"eventTypeId":"bad","startsAt":"2026-10-20T07:07:00Z","guest":` + guest + `}`, status: 422, field: "/eventTypeId", code: api.InvalidFormat},
		{name: "bad timestamp", method: "POST", path: "/api/bookings", body: booking("2026-02-30T07:07:00Z", guest), status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "bad offset", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00+24:00", guest), status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "comma fraction", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00,1Z", guest), status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "seconds", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:01Z", guest), status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "fraction beyond Go precision", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00.0000000001Z", guest), status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "UUID v7 and offset accepted", method: "POST", path: "/api/bookings", body: booking("2026-10-20T10:07:00+03:00", guest), status: 204},
		{name: "date path", method: "PUT", path: "/api/admin/availability/dates/2026-02-30", body: `{"isBlocked":false}`, status: 400},
		{name: "UUID path", method: "POST", path: "/api/event-types/bad/availability/check", body: `{"startsAt":"bad"}`, status: 400},
		{name: "omitted intervals", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false}`, status: 204},
		{name: "empty intervals", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[]}`, status: 204},
		{name: "null intervals", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":null}`, status: 422, field: "/intervals", code: api.InvalidFormat},
		{name: "missing flag", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"intervals":[]}`, status: 422, field: "/isBlocked", code: api.Required},
		{name: "reversed interval", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[{"start":"10:00","end":"09:00"}]}`, status: 422, field: "/intervals/0/end", code: api.InvalidInterval},
		{name: "overlap", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[{"start":"10:00","end":"12:00"},{"start":"11:00","end":"13:00"}]}`, status: 422, field: "/intervals/1/start", code: api.OverlappingIntervals},
		{name: "touching unsorted intervals", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[{"start":"12:00","end":"24:00"},{"start":"09:00","end":"12:00"}]}`, status: 204},
		{name: "bad timezone", method: "POST", path: "/api/admin/scheduling-settings/time-zone", body: `{"timeZone":"Local"}`, status: 422, field: "/timeZone", code: api.InvalidFormat},
		{name: "IANA timezone", method: "POST", path: "/api/admin/scheduling-settings/time-zone", body: `{"timeZone":"Europe/Moscow"}`, status: 204},
		{name: "trim event name", method: "POST", path: "/api/admin/event-types", body: `{"name":" ","durationMinutes":30}`, status: 422, field: "/name", code: api.OutOfRange},
		{name: "duration union", method: "POST", path: "/api/admin/event-types", body: `{"name":"Call","durationMinutes":61}`, status: 422, field: "/durationMinutes", code: api.OutOfRange},
		{name: "injected immutable field", method: "PUT", path: "/api/admin/scheduling-settings", body: `{"meetingPauseMinutes":0,"timeZone":"UTC"}`, status: 422, field: "/timeZone", code: api.UnknownField},
		{name: "null name preserved", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":null,"email":"anna@example.com"}`), status: 422, field: "/guest/name", code: api.InvalidFormat},
		{name: "long guest name", method: "POST", path: "/api/bookings", body: booking("2026-10-20T07:07:00Z", `{"name":"`+strings.Repeat("я", 101)+`","email":"anna@example.com"}`), status: 422, field: "/guest/name", code: api.OutOfRange},
		{name: "date timestamp forbidden in path", method: "PUT", path: "/api/admin/availability/dates/2026-10-20T00:00:00Z", body: `{"isBlocked":false}`, status: 400},
		{name: "positive offset crossing UTC date", method: "POST", path: "/api/event-types/" + eventID + "/availability/check", body: `{"startsAt":"2026-10-20T00:07:00+03:00"}`, status: 204},
		{name: "check minute precision", method: "POST", path: "/api/event-types/" + eventID + "/availability/check", body: `{"startsAt":"2026-10-20T07:07:00.1Z"}`, status: 422, field: "/startsAt", code: api.InvalidFormat},
		{name: "null blocked flag", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":null}`, status: 422, field: "/isBlocked", code: api.InvalidFormat},
		{name: "invalid interval clock", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[{"start":"24:00","end":"24:00"}]}`, status: 422, field: "/intervals/0/start", code: api.InvalidFormat},
		{name: "interval unknown property", method: "PUT", path: "/api/admin/availability/dates/2026-10-20", body: `{"isBlocked":false,"intervals":[{"start":"09:00","end":"10:00","extra":null}]}`, status: 422, field: "/intervals/0/extra", code: api.UnknownField},
		{name: "timezone is not trimmed", method: "POST", path: "/api/admin/scheduling-settings/time-zone", body: `{"timeZone":" UTC "}`, status: 422, field: "/timeZone", code: api.InvalidFormat},
		{name: "numeric timezone", method: "POST", path: "/api/admin/scheduling-settings/time-zone", body: `{"timeZone":"+03:00"}`, status: 422, field: "/timeZone", code: api.InvalidFormat},
		{name: "too few weekdays", method: "PUT", path: "/api/admin/availability/weekly", body: `{"days":[]}`, status: 422, field: "/days", code: api.OutOfRange},
		{name: "pause out of range", method: "PUT", path: "/api/admin/scheduling-settings", body: `{"meetingPauseMinutes":61}`, status: 422, field: "/meetingPauseMinutes", code: api.OutOfRange},
		{name: "fractional pause", method: "PUT", path: "/api/admin/scheduling-settings", body: `{"meetingPauseMinutes":0.5}`, status: 422, field: "/meetingPauseMinutes", code: api.InvalidFormat},
		{name: "huge JSON number is a field error", method: "PUT", path: "/api/admin/scheduling-settings", body: `{"meetingPauseMinutes":1e10000}`, status: 422, field: "/meetingPauseMinutes", code: api.InvalidFormat},
	}
	validator, err := newRequestValidator()
	require.NoError(t, err)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			router := gin.New()
			router.Use(validator.middleware())
			router.NoRoute(func(c *gin.Context) { c.Status(http.StatusNoContent) })
			req := httptest.NewRequestWithContext(t.Context(), tt.method, tt.path, strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			require.Equal(t, tt.status, response.Code, response.Body.String())
			if tt.status == 422 {
				var failure api.ValidationError
				require.NoError(t, json.Unmarshal(response.Body.Bytes(), &failure))
				require.Equal(t, api.ValidationErrorCodeValidationError, failure.Code)
				require.NotEmpty(t, failure.Fields)
				found := false
				for _, field := range failure.Fields {
					require.NotEmpty(t, field.Message)
					require.True(t, field.Code.Valid())
					if field.Field == tt.field && field.Code == tt.code {
						found = true
					}
				}
				require.True(t, found, "expected %s %s: %s", tt.field, tt.code, response.Body.String())
			}
			if tt.status == 400 {
				require.JSONEq(t, `{"code":"bad_request","message":"Некорректный запрос"}`, response.Body.String())
			}
		})
	}
}

func TestNormalizedBodyReachesBinding(t *testing.T) {
	validator, err := newRequestValidator()
	require.NoError(t, err)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/bookings", validator.middleware(), func(c *gin.Context) {
		var body api.CreateBookingRequest
		require.NoError(t, c.ShouldBindJSON(&body))
		require.Equal(t, strings.Repeat("я", 100), body.Guest.Name)
		require.Equal(t, "anna@example.com", string(body.Guest.Email))
		require.Equal(t, "2026-10-20T07:07:00Z", body.StartsAt.Format("2006-01-02T15:04:05Z07:00"))
		c.Status(http.StatusNoContent)
	})
	body := fmt.Sprintf(`{"eventTypeId":%q,"startsAt":"2026-10-20T10:07:00.000000000000+03:00","guest":{"name":"  %s  ","email":" anna@example.com "}}`, eventID, strings.Repeat("я", 100))
	request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api/bookings", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusNoContent, response.Code, response.Body.String())
}

func TestWeeklyRules(t *testing.T) {
	validator, err := newRequestValidator()
	require.NoError(t, err)
	for _, duplicate := range []bool{false, true} {
		t.Run(fmt.Sprint(duplicate), func(t *testing.T) {
			days := []map[string]any{}
			for _, weekday := range []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"} {
				days = append(days, map[string]any{"weekday": weekday, "isBlocked": false, "intervals": []any{}})
			}
			if duplicate {
				days[6]["weekday"] = "monday"
			}
			body, err := json.Marshal(map[string]any{"days": days})
			require.NoError(t, err)
			router := gin.New()
			router.PUT("/api/admin/availability/weekly", validator.middleware(), func(c *gin.Context) { c.Status(204) })
			req := httptest.NewRequestWithContext(t.Context(), http.MethodPut, "/api/admin/availability/weekly", strings.NewReader(string(body)))
			req.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if duplicate {
				require.Equal(t, 422, response.Code)
				require.Contains(t, response.Body.String(), `"field":"/days/6/weekday"`)
				require.Contains(t, response.Body.String(), `"code":"duplicate_weekday"`)
			} else {
				require.Equal(t, 204, response.Code)
			}
		})
	}
}
