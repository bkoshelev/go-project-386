import { assign, fromPromise, setup } from "xstate";
import type {
  AvailableSlot,
  BookingConfirmation,
  BookingGuest,
  CreateBookingRequest,
  EventType,
} from "../../api/generated";
import { saveBooking, validateGuest, type FieldErrors } from "./workflows";

export type Selection = { event: EventType; slot: AvailableSlot };
type Context = {
  eventTypeId: string | null;
  selection: Selection | null;
  guest: BookingGuest;
  errors: FieldErrors;
  notice: string;
  confirmation: BookingConfirmation | null;
};

export const bookingMachine = setup({
  types: {
    context: {} as Context,
    events: {} as
      | { type: "typeChosen"; id: string }
      | { type: "slotChosen"; selection: Selection }
      | { type: "guestChanged"; values: Partial<BookingGuest> }
      | { type: "backToTypes" | "backToTime" | "missingType" | "save" },
  },
  actors: {
    save: fromPromise(({ input, signal }: { input: CreateBookingRequest; signal: AbortSignal }) =>
      saveBooking(input, signal),
    ),
  },
  actions: {
    missing: assign({
      eventTypeId: null,
      selection: null,
      notice: "Тип события не найден. Выберите другой тип.",
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
        typeChosen: {
          target: "time",
          actions: assign({ eventTypeId: ({ event }) => event.id, selection: null, notice: "" }),
        },
      },
    },
    time: {
      on: {
        backToTypes: { target: "type", actions: assign({ eventTypeId: null, selection: null }) },
        missingType: { target: "type", actions: "missing" },
        slotChosen: {
          target: "contacts.editing",
          actions: assign({ selection: ({ event }) => event.selection, notice: "", errors: {} }),
        },
      },
    },
    contacts: {
      initial: "editing",
      on: {
        backToTime: { target: "time", actions: assign({ selection: null, notice: "" }) },
        guestChanged: {
          actions: assign({
            guest: ({ context, event }) => ({ ...context.guest, ...event.values }),
          }),
        },
        save: { target: "validating" },
      },
      states: { editing: {}, invalid: {}, rejected: {}, unknown: {} },
    },
    validating: {
      entry: assign({ errors: ({ context }) => validateGuest(context.guest) }),
      always: [
        {
          guard: ({ context }) => Object.keys(context.errors).length > 0,
          target: "contacts.invalid",
        },
        { target: "saving" },
      ],
    },
    saving: {
      invoke: {
        src: "save",
        input: ({ context }) => ({
          eventTypeId: context.eventTypeId!,
          startsAt: context.selection!.slot.startsAt,
          guest: { name: context.guest.name.trim(), email: context.guest.email.trim() },
        }),
        onDone: [
          {
            guard: ({ event }) => event.output.kind === "confirmed",
            target: "confirmed",
            actions: assign({
              confirmation: ({ event }) =>
                event.output.kind === "confirmed" ? event.output.confirmation : null,
            }),
          },
          {
            guard: ({ event }) => event.output.kind === "conflict",
            target: "time",
            actions: assign({
              selection: null,
              notice: ({ event }) => (event.output.kind === "conflict" ? event.output.message : ""),
            }),
          },
          {
            guard: ({ event }) => event.output.kind === "missing",
            target: "type",
            actions: "missing",
          },
          {
            guard: ({ event }) => event.output.kind === "invalid",
            target: "contacts.invalid",
            actions: assign({
              errors: ({ event }) => (event.output.kind === "invalid" ? event.output.errors : {}),
            }),
          },
          { guard: ({ event }) => event.output.kind === "rejected", target: "contacts.rejected" },
          { target: "contacts.unknown" },
        ],
        onError: "contacts.unknown",
      },
    },
    confirmed: { type: "final" },
  },
});
