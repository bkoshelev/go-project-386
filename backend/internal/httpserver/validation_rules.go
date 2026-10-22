package httpserver

import "github.com/bkoshelev/go-project-386/backend/internal/api"

// Only format rules absent from the schema belong here. Scheduling semantics
// are delegated to their owner, including before the generated request binding.
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
	}
	return schedulingRules(operation, object)
}
