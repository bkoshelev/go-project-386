package scheduling

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"time"
	_ "time/tzdata" // IANA validation must work on hosts without a zoneinfo database.
)

// Issue describes an invalid scheduling value at its document field path.
type Issue struct{ Field, Code, Message string }

// ValidationError reports semantic errors before any write is attempted.
type ValidationError struct{ Fields []Issue }

func (e *ValidationError) Error() string { return "invalid scheduling values" }

// ValidateTimeZone accepts a named IANA zone, never the host-dependent Local zone.
func ValidateTimeZone(zone string) []Issue {
	_, err := time.LoadLocation(zone)
	if err != nil || zone == "Local" || zone == "" {
		return []Issue{{Field: "/timeZone", Code: "invalid_format", Message: "Укажите часовой пояс IANA"}}
	}
	return nil
}

var clockTime = regexp.MustCompile(`^(?:[01][0-9]|2[0-3]):[0-5][0-9]$`)

// Validate checks all days, including blocked days whose intervals are retained.
func (w Week) Validate() []Issue {
	var fields []Issue
	if len(w.Days) != 7 {
		fields = append(fields, Issue{Field: "/days", Code: "out_of_range", Message: "Укажите семь дней недели"})
	}
	seen := map[Weekday]bool{}
	for i, day := range w.Days {
		path := fmt.Sprintf("/days/%d", i)
		if !slices.Contains([]Weekday{Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday}, day.Weekday) {
			fields = append(fields, Issue{Field: path + "/weekday", Code: "out_of_range", Message: "Укажите день недели"})
		}
		if seen[day.Weekday] {
			fields = append(fields, Issue{Field: path + "/weekday", Code: "duplicate_weekday", Message: "День недели уже указан"})
		}
		seen[day.Weekday] = true
		fields = append(fields, ValidateIntervals(path+"/intervals", day.Intervals)...)
	}
	return fields
}

// ValidateIntervals checks clock ranges and overlap, allowing touching boundaries.
func ValidateIntervals(path string, values []Interval) []Issue {
	type indexedInterval struct {
		Interval
		index int
	}
	intervals := make([]indexedInterval, 0, len(values))
	var fields []Issue
	for i, value := range values {
		startOK := clockTime.MatchString(value.Start)
		endOK := clockTime.MatchString(value.End) || value.End == "24:00"
		if !startOK {
			fields = append(fields, Issue{Field: fmt.Sprintf("%s/%d/start", path, i), Code: "invalid_format", Message: "Укажите начало в формате ЧЧ:ММ"})
		}
		if !endOK {
			fields = append(fields, Issue{Field: fmt.Sprintf("%s/%d/end", path, i), Code: "invalid_format", Message: "Укажите окончание в формате ЧЧ:ММ"})
		}
		if !startOK || !endOK {
			continue
		}
		if value.Start >= value.End {
			fields = append(fields, Issue{Field: fmt.Sprintf("%s/%d/end", path, i), Code: "invalid_interval", Message: "Окончание должно быть позже начала"})
			continue
		}
		intervals = append(intervals, indexedInterval{Interval: value, index: i})
	}
	slices.SortStableFunc(intervals, func(a, b indexedInterval) int { return strings.Compare(a.Start, b.Start) })
	maxEnd := ""
	for _, interval := range intervals {
		if interval.Start < maxEnd {
			fields = append(fields, Issue{Field: fmt.Sprintf("%s/%d/start", path, interval.index), Code: "overlapping_intervals", Message: "Интервалы пересекаются"})
		}
		if interval.End > maxEnd {
			maxEnd = interval.End
		}
	}
	return fields
}
