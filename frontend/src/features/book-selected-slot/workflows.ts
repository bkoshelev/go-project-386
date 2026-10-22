import {
  createBooking,
  type BookingConfirmation,
  type BookingGuest,
  type CreateBookingRequest,
} from "../../api/generated";

export type FieldErrors = Partial<Record<keyof BookingGuest, string>>;
export type SaveResult =
  | { kind: "confirmed"; confirmation: BookingConfirmation }
  | { kind: "invalid"; errors: FieldErrors }
  | { kind: "conflict"; message: string }
  | { kind: "missing" }
  | { kind: "rejected" }
  | { kind: "unknown" };

export function validateGuest(guest: BookingGuest): FieldErrors {
  const errors: FieldErrors = {};
  const name = guest.name.trim();
  const email = guest.email.trim();
  if (!name) errors.name = "Введите имя";
  else if (Array.from(name).length > 100) errors.name = "Имя должно содержать до 100 символов";
  if (!email) errors.email = "Введите email";
  else if (Array.from(email).length > 254) errors.email = "Email должен содержать до 254 символов";
  else if (!/^[^\s@]+@[^\s@]+$/.test(email)) errors.email = "Введите корректный email";
  return errors;
}

function isConfirmation(data: unknown, body: CreateBookingRequest): data is BookingConfirmation {
  if (!data || typeof data !== "object") return false;
  return (
    "id" in data &&
    typeof data.id === "string" &&
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data.id) &&
    "status" in data &&
    data.status === "confirmed" &&
    "eventTypeId" in data &&
    data.eventTypeId === body.eventTypeId &&
    "eventTypeName" in data &&
    typeof data.eventTypeName === "string" &&
    "startsAt" in data &&
    typeof data.startsAt === "string" &&
    Date.parse(data.startsAt) === Date.parse(body.startsAt) &&
    "endsAt" in data &&
    typeof data.endsAt === "string" &&
    Date.parse(data.endsAt) > Date.parse(body.startsAt)
  );
}

export async function saveBooking(
  body: CreateBookingRequest,
  signal: AbortSignal,
): Promise<SaveResult> {
  try {
    const result = await createBooking({ body, signal });
    if (!result.response) return { kind: "unknown" };
    if (result.response.status === 201 && isConfirmation(result.data, body))
      return { kind: "confirmed", confirmation: result.data };
    if (result.response.ok) return { kind: "unknown" };
    const error = result.error;
    if (error?.code === "validation_error") {
      const errors: FieldErrors = {};
      for (const issue of error.fields) {
        if (issue.field === "/guest/name") errors.name = issue.message;
        if (issue.field === "/guest/email") errors.email = issue.message;
      }
      return { kind: "invalid", errors };
    }
    if (error?.code === "event_type_not_found") return { kind: "missing" };
    if (error?.code === "time_occupied")
      return { kind: "conflict", message: "Время уже занято. Выберите другое время." };
    if (error?.code === "time_unavailable")
      return { kind: "conflict", message: "Выбранное время недоступно. Выберите другое время." };
    return { kind: "rejected" };
  } catch {
    return { kind: "unknown" };
  }
}
