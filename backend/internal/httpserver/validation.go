package httpserver

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/mail"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/legacy"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/bkoshelev/go-project-386/backend/internal/api"
)

// The Go parser accepts comma fractions and out-of-range offsets, unlike RFC 3339.
var instantPattern = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])$`)
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type requestValidator struct {
	router  routers.Router
	options []openapi3.SchemaValidationOption
}

func newRequestValidator() (*requestValidator, error) {
	spec, err := api.GetSpec()
	if err != nil {
		return nil, fmt.Errorf("load API schema: %w", err)
	}
	router, err := legacy.NewRouter(spec)
	if err != nil {
		return nil, fmt.Errorf("create schema router: %w", err)
	}
	return &requestValidator{router: router, options: []openapi3.SchemaValidationOption{
		openapi3.MultiErrors(), openapi3.VisitAsRequest(), openapi3.EnableFormatValidation(),
		openapi3.WithStringFormatValidators(map[string]openapi3.StringFormatValidator{
			"uuid": openapi3.NewCallbackValidator(func(s string) error {
				if !uuidPattern.MatchString(s) {
					return fmt.Errorf("invalid UUID")
				}
				_, err := uuid.Parse(s)
				return err
			}),
			"email": openapi3.NewCallbackValidator(func(s string) error {
				address, err := mail.ParseAddress(s)
				if err != nil {
					return err
				}
				if address.Address != s {
					return fmt.Errorf("expected an email address without a display name")
				}
				return nil
			}),
			"date": openapi3.NewCallbackValidator(func(s string) error {
				_, err := time.Parse(time.DateOnly, s)
				return err
			}),
			"date-time": openapi3.NewCallbackValidator(func(s string) error {
				_, err := parseInstant(s)
				return err
			}),
		}),
	}}, nil
}

// Register this middleware on the generated route group, before the generated
// wrappers bind path parameters or decode JSON. Unimplemented routes stay 404.
func (v *requestValidator) middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		route, params, err := v.router.FindRoute(c.Request)
		if err != nil {
			writeInternalError(c)
			return
		}
		parameters := append(append(openapi3.Parameters{}, route.PathItem.Parameters...), route.Operation.Parameters...)
		for _, ref := range parameters {
			parameter := ref.Value
			if parameter.In != openapi3.ParameterInPath {
				continue
			}
			if err := parameter.Schema.Value.VisitJSON(params[parameter.Name], v.options...); err != nil {
				writeBadRequest(c)
				return
			}
		}
		if route.Operation.RequestBody == nil {
			c.Next()
			return
		}
		mediaType, _, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeBadRequest(c)
			return
		}
		body, err := io.ReadAll(c.Request.Body)
		closeErr := c.Request.Body.Close()
		if err != nil || closeErr != nil || !json.Valid(body) {
			writeBadRequest(c)
			return
		}
		var value any
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.UseNumber()
		if err := decoder.Decode(&value); err != nil {
			writeBadRequest(c)
			return
		}
		normalizeRequest(route.Operation.OperationID, value)
		schema := route.Operation.RequestBody.Value.Content.Get(mediaType).Schema.Value
		// The contract uses the shared OpenAPI 3.0/3.1 keyword subset. VisitJSON's
		// built-in validator preserves SchemaError paths and scoped format validators;
		// kin-openapi v0.142.0's JSON Schema 2020 adapter discards that information.
		if err := schema.VisitJSON(value, v.options...); err != nil {
			fields := schemaIssues(err)
			if len(fields) == 0 {
				writeInternalError(c)
			} else {
				writeValidationError(c, fields)
			}
			return
		}
		if fields := validateRules(route.Operation.OperationID, value); len(fields) > 0 {
			writeValidationError(c, fields)
			return
		}
		normalized, err := json.Marshal(value)
		if err != nil {
			writeInternalError(c)
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(normalized))
		c.Request.ContentLength = int64(len(normalized))
		c.Next()
	}
}

func normalizeRequest(operation string, value any) {
	object, ok := value.(map[string]any)
	if !ok {
		return
	}
	switch operation {
	case "CreateEventType":
		trimProperty(object, "name")
	case "CreateBooking":
		if guest, ok := object["guest"].(map[string]any); ok {
			trimProperty(guest, "name")
			trimProperty(guest, "email")
		}
	}
	if operation == "CreateBooking" || operation == "CheckEventAvailability" {
		if s, ok := object["startsAt"].(string); ok {
			if instant, err := parseInstant(s); err == nil && minuteAligned(s, instant) {
				object["startsAt"] = instant.UTC().Format(time.RFC3339Nano)
			}
		}
	}
}

func trimProperty(object map[string]any, key string) {
	if value, ok := object[key].(string); ok {
		object[key] = strings.TrimSpace(value)
	}
}

func parseInstant(value string) (time.Time, error) {
	if !instantPattern.MatchString(value) {
		return time.Time{}, fmt.Errorf("invalid RFC 3339 timestamp")
	}
	return time.Parse(time.RFC3339Nano, value)
}

func minuteAligned(value string, instant time.Time) bool {
	if instant.Second() != 0 || instant.Nanosecond() != 0 {
		return false
	}
	// time.Parse truncates fractions beyond nanoseconds; retain their precision
	// check before UTC normalization can erase non-zero trailing digits.
	if dot := strings.IndexByte(value, '.'); dot >= 0 {
		for _, digit := range value[dot+1:] {
			if digit < '0' || digit > '9' {
				break
			}
			if digit != '0' {
				return false
			}
		}
	}
	return true
}

func pointer(parts []string) string {
	escaped := make([]string, len(parts))
	for i, part := range parts {
		escaped[i] = strings.ReplaceAll(strings.ReplaceAll(part, "~", "~0"), "/", "~1")
	}
	if len(parts) == 0 {
		return ""
	}
	return "/" + strings.Join(escaped, "/")
}

func schemaIssues(err error) []api.FieldIssue {
	var fields []api.FieldIssue
	//nolint:errorlint // Traverse immediate schema-tree nodes; errors.As would descend into union branches and lose their parent paths.
	switch failure := err.(type) {
	case openapi3.MultiError:
		for _, child := range failure {
			fields = append(fields, schemaIssues(child)...)
		}
	case *openapi3.SchemaError:
		path := failure.JSONPointer()
		if failure.SchemaField == "properties" {
			object, ok := failure.Value.(map[string]any)
			if ok {
				for name := range object {
					if _, known := failure.Schema.Properties[name]; !known {
						fields = append(fields, issue(pointer(append(slices.Clone(path), name)), api.UnknownField, "Неизвестное поле"))
					}
				}
			}
		} else {
			code := api.InvalidFormat
			switch failure.SchemaField {
			case "required":
				code = api.Required
			case "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "minItems", "maxItems", "anyOf", "enum":
				code = api.OutOfRange
			}
			fields = append(fields, issue(pointer(path), code, "Проверьте значение поля"))
		}
	}
	slices.SortFunc(fields, func(a, b api.FieldIssue) int {
		if order := strings.Compare(a.Field, b.Field); order != 0 {
			return order
		}
		return strings.Compare(string(a.Code), string(b.Code))
	})
	return slices.CompactFunc(fields, func(a, b api.FieldIssue) bool { return a.Field == b.Field && a.Code == b.Code })
}

func issue(field string, code api.FieldIssueCode, message string) api.FieldIssue {
	return api.FieldIssue{Field: field, Code: code, Message: message}
}

func writeValidationError(c *gin.Context, fields []api.FieldIssue) {
	c.AbortWithStatusJSON(http.StatusUnprocessableEntity, api.ValidationError{
		Code: api.ValidationErrorCodeValidationError, Message: "Проверьте данные формы", Fields: fields,
	})
}
