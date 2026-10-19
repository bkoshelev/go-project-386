import "@typespec/http";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Calendar Booking API" })
@info(#{ version: "0.0.0" })
namespace CalendarBooking;

/** The process is running and can serve HTTP requests. */
model HealthStatus {
  status: "ok";
}

/** Check backend liveness without querying external dependencies. */
@route("/healthz")
@get
@operationId("getHealth")
op getHealth(): HealthStatus;
