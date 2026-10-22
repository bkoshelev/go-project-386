// Package scheduling owns the owner's weekly hours and scheduling settings.
package scheduling

// Weekday identifies a local day of the owner's week.
type Weekday string

// Weekdays in contract order, Monday through Sunday.
const (
	Monday    Weekday = "monday"
	Tuesday   Weekday = "tuesday"
	Wednesday Weekday = "wednesday"
	Thursday  Weekday = "thursday"
	Friday    Weekday = "friday"
	Saturday  Weekday = "saturday"
	Sunday    Weekday = "sunday"
)

// Interval is a half-open range of local clock times; only End may be 24:00.
type Interval struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// Day retains its intervals even while blocked.
type Day struct {
	Weekday   Weekday    `json:"weekday"`
	IsBlocked bool       `json:"isBlocked"`
	Intervals []Interval `json:"intervals"`
}

// Week is persisted atomically as one JSONB document.
type Week struct {
	Days []Day `json:"days"`
}

// Settings contains the immutable first time zone and the meeting pause.
type Settings struct {
	TimeZone            *string
	MeetingPauseMinutes int32
}
