import { createEventType, type CreateEventTypeRequest } from "../../api/generated";

export type FieldErrors = Partial<Record<"name" | "description" | "durationMinutes", string>>;

export type CreationResult =
  | { kind: "created" }
  | { kind: "rejected"; fields: FieldErrors }
  | { kind: "unknown" };

function confirmsCreation(data: unknown, request: CreateEventTypeRequest) {
  // Generated TypeScript types do not validate the response received over the network.
  // The server's name normalization is authoritative and can differ from String.trim().
  return (
    typeof data === "object" &&
    data !== null &&
    "id" in data &&
    typeof data.id === "string" &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data.id) &&
    "name" in data &&
    typeof data.name === "string" &&
    data.name.length > 0 &&
    "durationMinutes" in data &&
    data.durationMinutes === request.durationMinutes &&
    ("description" in data ? data.description : undefined) === request.description
  );
}

export async function saveEventType(
  body: CreateEventTypeRequest,
  signal: AbortSignal,
): Promise<CreationResult> {
  try {
    const result = await createEventType({ body, signal });
    if (!result.response) return { kind: "unknown" };
    if (!result.response.ok) {
      const fields: FieldErrors = {};
      if (result.error?.code === "validation_error") {
        for (const issue of result.error.fields) {
          if (issue.field === "/name") fields.name = issue.message;
          else if (issue.field === "/description") fields.description = issue.message;
          else if (issue.field === "/durationMinutes") fields.durationMinutes = issue.message;
        }
      }
      return { kind: "rejected", fields };
    }
    if (result.response.status === 201 && confirmsCreation(result.data, body)) {
      return { kind: "created" };
    }
    return { kind: "unknown" };
  } catch {
    // An aborted request or a lost/invalid response cannot prove that the write rolled back.
    return { kind: "unknown" };
  }
}
