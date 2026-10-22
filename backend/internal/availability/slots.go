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
func Calculate(week scheduling.Week, location *time.Location, duration time.Duration, now time.Time, dates map[string]scheduling.Date) Result {
	return newSnapshot(week, location, duration, now, dates).Suggestions()
}

// Reason identifies the first unmet availability rule, in contract priority order.
type Reason string

// Reasons follow the public contract priority, from initialization to occupation.
const (
	ScheduleNotInitialized Reason = "schedule_not_initialized"
	StartsInPast           Reason = "starts_in_past"
	OutsideBookingWindow   Reason = "outside_booking_window"
	OutsideWorkingHours    Reason = "outside_working_hours"
	TimeOccupied           Reason = "time_occupied"
)

// Snapshot contains the settings and busy intervals used by both reads and writes.
type Snapshot struct {
	Window          Result
	Working         []Slot
	Duration, Pause time.Duration
	Initialized     bool
	Busy            []Slot
	EventName       string
}

func newSnapshot(week scheduling.Week, location *time.Location, duration time.Duration, now time.Time, dates map[string]scheduling.Date) Snapshot {
	now = now.UTC()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	s := Snapshot{Window: Result{GeneratedAt: now, WindowStartsAt: start, WindowEndsAt: start.AddDate(0, 0, 14), Slots: []Slot{}}, Duration: duration, Initialized: location != nil}
	if location != nil {
		s.Working = workingRanges(week, location, s.Window.WindowStartsAt, s.Window.WindowEndsAt, dates)
	}
	return s
}

// Check applies the same rules to any minute-aligned start, without reserving it.
func (s Snapshot) Check(start time.Time) Reason {
	if !s.Initialized {
		return ScheduleNotInitialized
	}
	if !start.After(s.Window.GeneratedAt) {
		return StartsInPast
	}
	end := start.Add(s.Duration)
	if start.Before(s.Window.WindowStartsAt) || end.After(s.Window.WindowEndsAt) {
		return OutsideBookingWindow
	}
	fits := false
	for _, working := range s.Working {
		if !start.Before(working.StartsAt) && !end.After(working.EndsAt) {
			fits = true
			break
		}
	}
	if !fits {
		return OutsideWorkingHours
	}
	for _, busy := range s.Busy {
		if start.Before(busy.EndsAt.Add(s.Pause)) && end.Add(s.Pause).After(busy.StartsAt) {
			return TimeOccupied
		}
	}
	return ""
}

// Suggestions finds quarter-hour starts using exactly the creation rules.
func (s Snapshot) Suggestions() Result {
	result := s.Window
	if s.Duration <= 0 {
		return result
	}
	for instant := result.GeneratedAt.Truncate(15 * time.Minute).Add(15 * time.Minute); !instant.Add(s.Duration).After(result.WindowEndsAt); instant = instant.Add(15 * time.Minute) {
		if s.Check(instant) == "" {
			result.Slots = append(result.Slots, Slot{StartsAt: instant, EndsAt: instant.Add(s.Duration)})
		}
	}
	return result
}

// Expand each affected owner-local date, then merge touching intervals, including midnight.
func workingRanges(week scheduling.Week, location *time.Location, start, end time.Time, dates map[string]scheduling.Date) []Slot {
	weekdays := []scheduling.Weekday{scheduling.Sunday, scheduling.Monday, scheduling.Tuesday, scheduling.Wednesday, scheduling.Thursday, scheduling.Friday, scheduling.Saturday}
	localStart := start.In(location)
	day := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, location)
	var ranges []Slot
	for ; day.Before(end); day = day.AddDate(0, 0, 1) {
		for _, settings := range week.Days {
			if settings.IsBlocked || settings.Weekday != weekdays[day.Weekday()] {
				continue
			}
			date := dates[day.Format(time.DateOnly)]
			if date.IsBlocked {
				continue
			}
			intervals := settings.Intervals
			if date.Intervals != nil {
				intervals = *date.Intervals
			}
			for _, interval := range intervals {
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
