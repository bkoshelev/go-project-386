// Package availability calculates suggested slots and reads guest availability.
package availability

import (
	"slices"
	"time"

	"github.com/bkoshelev/go-project-386/backend/internal/scheduling"
)

// Slot is an absolute, half-open meeting interval.
type Slot struct{ StartsAt, EndsAt time.Time }

// Result includes UTC window boundaries, independent of the guest's time zone.
type Result struct {
	GeneratedAt, WindowStartsAt, WindowEndsAt time.Time
	Slots                                     []Slot
}

// Calculate suggests future quarter-hour starts fitting entirely in continuous
// working time and the fourteen-date UTC window. A nil location means uninitialized.
func Calculate(week scheduling.Week, location *time.Location, duration time.Duration, now time.Time) Result {
	now = now.UTC()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	result := Result{GeneratedAt: now, WindowStartsAt: start, WindowEndsAt: start.AddDate(0, 0, 14), Slots: []Slot{}}
	if location == nil || duration <= 0 {
		return result
	}
	ranges := weeklyWorkingRanges(week, location, result.WindowStartsAt, result.WindowEndsAt)
	for instant := now.Truncate(15 * time.Minute).Add(15 * time.Minute); !instant.Add(duration).After(result.WindowEndsAt); instant = instant.Add(15 * time.Minute) {
		for _, working := range ranges {
			if !instant.Before(working.StartsAt) && !instant.Add(duration).After(working.EndsAt) {
				result.Slots = append(result.Slots, Slot{StartsAt: instant, EndsAt: instant.Add(duration)})
				break
			}
		}
	}
	return result
}

// Expand each affected owner-local date, then merge touching intervals, including midnight.
func weeklyWorkingRanges(week scheduling.Week, location *time.Location, start, end time.Time) []Slot {
	weekdays := []scheduling.Weekday{scheduling.Sunday, scheduling.Monday, scheduling.Tuesday, scheduling.Wednesday, scheduling.Thursday, scheduling.Friday, scheduling.Saturday}
	localStart := start.In(location)
	day := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, location)
	var ranges []Slot
	for ; day.Before(end); day = day.AddDate(0, 0, 1) {
		for _, settings := range week.Days {
			if settings.IsBlocked || settings.Weekday != weekdays[day.Weekday()] {
				continue
			}
			for _, interval := range settings.Intervals {
				ranges = append(ranges, Slot{StartsAt: localClock(day, interval.Start), EndsAt: localClock(day, interval.End)})
			}
		}
	}
	slices.SortFunc(ranges, func(a, b Slot) int { return a.StartsAt.Compare(b.StartsAt) })
	merged := make([]Slot, 0, len(ranges))
	for _, interval := range ranges {
		if len(merged) > 0 && !interval.StartsAt.After(merged[len(merged)-1].EndsAt) {
			if interval.EndsAt.After(merged[len(merged)-1].EndsAt) {
				merged[len(merged)-1].EndsAt = interval.EndsAt
			}
		} else {
			merged = append(merged, interval)
		}
	}
	return merged
}

func localClock(day time.Time, clock string) time.Time {
	// The saved schedule has already passed the contract's HH:mm validation.
	hour := int(clock[0]-'0')*10 + int(clock[1]-'0')
	minute := int(clock[3]-'0')*10 + int(clock[4]-'0')
	return time.Date(day.Year(), day.Month(), day.Day(), hour, minute, 0, 0, day.Location()).UTC()
}
