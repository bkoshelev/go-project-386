package availability_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/bkoshelev/go-project-386/backend/internal/availability"
	"github.com/bkoshelev/go-project-386/backend/internal/scheduling"
)

func TestSlotsStartStrictlyInFutureAndFitFullDuration(t *testing.T) {
	now := time.Date(2026, 10, 19, 9, 0, 0, 0, time.UTC)
	week := scheduling.Week{Days: []scheduling.Day{{Weekday: scheduling.Monday, Intervals: []scheduling.Interval{{Start: "09:00", End: "10:00"}}}}}
	result := availability.Calculate(week, time.UTC, 30*time.Minute, now, nil)
	require.Equal(t, now, result.GeneratedAt)
	require.Equal(t, "2026-10-19T00:00:00Z", result.WindowStartsAt.Format(time.RFC3339))
	require.Equal(t, "2026-11-02T00:00:00Z", result.WindowEndsAt.Format(time.RFC3339))
	require.Equal(t, []availability.Slot{
		{StartsAt: now.Add(15 * time.Minute), EndsAt: now.Add(45 * time.Minute)},
		{StartsAt: now.Add(30 * time.Minute), EndsAt: now.Add(time.Hour)},
		{StartsAt: now.AddDate(0, 0, 7), EndsAt: now.AddDate(0, 0, 7).Add(30 * time.Minute)},
		{StartsAt: now.AddDate(0, 0, 7).Add(15 * time.Minute), EndsAt: now.AddDate(0, 0, 7).Add(45 * time.Minute)},
		{StartsAt: now.AddDate(0, 0, 7).Add(30 * time.Minute), EndsAt: now.AddDate(0, 0, 7).Add(time.Hour)},
	}, result.Slots)
}

func TestSlotsMergeTouchingHoursAcrossMidnightAndEndAtWindowBoundary(t *testing.T) {
	now := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	week := scheduling.Week{Days: []scheduling.Day{
		{Weekday: scheduling.Sunday, Intervals: []scheduling.Interval{{Start: "23:00", End: "23:30"}, {Start: "23:30", End: "24:00"}}},
		{Weekday: scheduling.Monday, Intervals: []scheduling.Interval{{Start: "00:00", End: "01:00"}}},
	}}
	result := availability.Calculate(week, time.UTC, 90*time.Minute, now, nil)
	require.Equal(t, []availability.Slot{
		{StartsAt: time.Date(2026, 10, 25, 23, 0, 0, 0, time.UTC), EndsAt: time.Date(2026, 10, 26, 0, 30, 0, 0, time.UTC)},
		{StartsAt: time.Date(2026, 10, 25, 23, 15, 0, 0, time.UTC), EndsAt: time.Date(2026, 10, 26, 0, 45, 0, 0, time.UTC)},
		{StartsAt: time.Date(2026, 10, 25, 23, 30, 0, 0, time.UTC), EndsAt: time.Date(2026, 10, 26, 1, 0, 0, 0, time.UTC)},
	}, result.Slots)
	// The shorter meeting may end exactly at the last boundary, but never after it.
	result = availability.Calculate(week, time.UTC, 60*time.Minute, now, nil)
	require.Equal(t, availability.Slot{StartsAt: time.Date(2026, 11, 1, 23, 0, 0, 0, time.UTC), EndsAt: time.Date(2026, 11, 2, 0, 0, 0, 0, time.UTC)}, result.Slots[len(result.Slots)-1])
}

func TestUninitializedScheduleHasNoSlots(t *testing.T) {
	result := availability.Calculate(scheduling.Week{}, nil, 30*time.Minute, time.Date(2026, 10, 19, 9, 7, 0, 0, time.UTC), nil)
	require.Empty(t, result.Slots)
	require.NotNil(t, result.Slots)
}
