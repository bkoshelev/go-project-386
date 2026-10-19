package httpserver

import (
	"fmt"
	"slices"
	"strings"
	"time"
	_ "time/tzdata" // Keep IANA validation available on hosts without a zoneinfo database.

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

// Only rules absent from the schema belong here. Availability and persistence
// remain application concerns and run after these field checks.
func validateRules(operation string, value any) []api.FieldIssue {
	object, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	switch operation {
	case "CreateBooking", "CheckEventAvailability":
		start, _ := object["startsAt"].(string)
		instant, err := parseInstant(start)
		if err == nil && !minuteAligned(start, instant) {
			return []api.FieldIssue{issue("/startsAt", api.InvalidFormat, "Укажите начало с точностью до минуты")}
		}
	case "InitializeScheduleTimeZone":
		zone, _ := object["timeZone"].(string)
		_, err := time.LoadLocation(zone)
		if err != nil || zone == "Local" || zone == "" {
			return []api.FieldIssue{issue("/timeZone", api.InvalidFormat, "Укажите часовой пояс IANA")}
		}
	case "UpdateWeeklyAvailability":
		var fields []api.FieldIssue
		days, _ := object["days"].([]any)
		seen := map[string]bool{}
		for i, value := range days {
			day, _ := value.(map[string]any)
			weekday, _ := day["weekday"].(string)
			if seen[weekday] {
				fields = append(fields, issue(fmt.Sprintf("/days/%d/weekday", i), api.DuplicateWeekday, "День недели уже указан"))
			}
			seen[weekday] = true
			fields = append(fields, intervalIssues(fmt.Sprintf("/days/%d/intervals", i), day["intervals"])...)
		}
		return fields
	case "UpdateDateAvailability":
		return intervalIssues("/intervals", object["intervals"])
	}
	return nil
}

func intervalIssues(path string, value any) []api.FieldIssue {
	type interval struct {
		start, end string
		index      int
	}
	values, _ := value.([]any)
	intervals := make([]interval, 0, len(values))
	var fields []api.FieldIssue
	for i, value := range values {
		object, _ := value.(map[string]any)
		start, _ := object["start"].(string)
		end, _ := object["end"].(string)
		if start >= end {
			fields = append(fields, issue(fmt.Sprintf("%s/%d/end", path, i), api.InvalidInterval, "Окончание должно быть позже начала"))
			continue
		}
		intervals = append(intervals, interval{start: start, end: end, index: i})
	}
	slices.SortStableFunc(intervals, func(a, b interval) int { return strings.Compare(a.start, b.start) })
	maxEnd := ""
	for _, interval := range intervals {
		if interval.start < maxEnd {
			fields = append(fields, issue(fmt.Sprintf("%s/%d/start", path, interval.index), api.OverlappingIntervals, "Интервалы пересекаются"))
		}
		if interval.end > maxEnd {
			maxEnd = interval.end
		}
	}
	return fields
}
