import { createAsyncLogic, setup, types } from "xstate";
import type {
  AvailableSlot,
  BookingConfirmation,
  BookingGuest,
  CreateBookingRequest,
  EventType,
} from "../../frontend/src/api/generated";
import {
  saveBooking,
  validateGuest,
  type FieldErrors,
  type SaveResult,
} from "../../frontend/src/features/book-selected-slot/workflows";

type Selection = { event: EventType; slot: AvailableSlot };
type Context = {
  eventTypeId: string | null;
  selection: Selection | null;
  guest: BookingGuest;
  errors: FieldErrors;
  notice: string;
  confirmation: BookingConfirmation | null;
};

const missing = {
  eventTypeId: null,
  selection: null,
  notice: "Тип события не найден. Выберите другой тип.",
};

export const bookingMachineV6 = setup({
  schemas: {
    context: types<Context>(),
    events: {
      typeChosen: types<{ id: string }>(),
      slotChosen: types<{ selection: Selection }>(),
      guestChanged: types<{ values: Partial<BookingGuest> }>(),
      backToTypes: types<{}>(),
      backToTime: types<{}>(),
      missingType: types<{}>(),
      save: types<{}>(),
    },
  },
  actors: {
    save: createAsyncLogic<SaveResult, CreateBookingRequest>({
      run: ({ input, signal }) => saveBooking(input, signal),
    }),
  },
}).createMachine({
  id: "booking",
  initial: "type",
  context: {
    eventTypeId: null,
    selection: null,
    guest: { name: "", email: "" },
    errors: {},
    notice: "",
    confirmation: null,
  },
  states: {
    type: {
      on: {
        typeChosen: ({ event }) => ({
          target: "time",
          context: { eventTypeId: event.id, selection: null, notice: "" },
        }),
      },
    },
    time: {
      on: {
        backToTypes: { target: "type", context: { eventTypeId: null, selection: null } },
        missingType: { target: "type", context: missing },
        slotChosen: ({ event }) => ({
          target: "contacts.editing",
          context: { selection: event.selection, notice: "", errors: {} },
        }),
      },
    },
    contacts: {
      initial: "editing",
      on: {
        backToTime: { target: "time", context: { selection: null, notice: "" } },
        guestChanged: ({ context, event }) => ({
          context: { guest: { ...context.guest, ...event.values } },
        }),
        save: { target: "validating" },
      },
      states: { editing: {}, invalid: {}, rejected: {}, unknown: {} },
    },
    validating: {
      entry: ({ context }) => ({ context: { errors: validateGuest(context.guest) } }),
      always: ({ context }) => ({
        target: Object.keys(context.errors).length > 0 ? "contacts.invalid" : "saving",
      }),
    },
    saving: {
      invoke: {
        src: "save",
        input: ({ context }) => ({
          eventTypeId: context.eventTypeId!,
          startsAt: context.selection!.slot.startsAt,
          guest: { name: context.guest.name.trim(), email: context.guest.email.trim() },
        }),
        onDone: ({ event }) => {
          switch (event.output.kind) {
            case "confirmed":
              return { target: "confirmed", context: { confirmation: event.output.confirmation } };
            case "conflict":
              return { target: "time", context: { selection: null, notice: event.output.message } };
            case "missing":
              return { target: "type", context: missing };
            case "invalid":
              return { target: "contacts.invalid", context: { errors: event.output.errors } };
            case "rejected":
              return { target: "contacts.rejected" };
            case "unknown":
              return { target: "contacts.unknown" };
          }
        },
        onError: { target: "contacts.unknown" },
      },
    },
    confirmed: { type: "final" },
  },
});
