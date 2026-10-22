import { assign, fromPromise, setup } from "xstate";
import type { AvailabilityTimeRange, WeeklyAvailability } from "../../api/generated";
import { initializeTimeZone, readSchedule, saveWeek, type FieldErrors } from "./workflows";
import { validateWeek } from "./validation";

type DraftEvent =
  | { type: "dayBlocked"; dayIndex: number; blocked: boolean }
  | { type: "intervalAdded"; dayIndex: number }
  | { type: "intervalRemoved"; dayIndex: number; intervalIndex: number }
  | {
      type: "intervalChanged";
      dayIndex: number;
      intervalIndex: number;
      values: Partial<AvailabilityTimeRange>;
    };
type Context = { week: WeeklyAvailability | null; timeZone?: string; errors: FieldErrors };

function editWeek(week: WeeklyAvailability, event: DraftEvent): WeeklyAvailability {
  return {
    days: week.days.map((day, index) => {
      if (index !== event.dayIndex) return day;
      switch (event.type) {
        case "dayBlocked":
          return { ...day, isBlocked: event.blocked };
        case "intervalAdded":
          return { ...day, intervals: [...day.intervals, { start: "", end: "" }] };
        case "intervalRemoved":
          return { ...day, intervals: day.intervals.filter((_, i) => i !== event.intervalIndex) };
        case "intervalChanged":
          return {
            ...day,
            intervals: day.intervals.map((interval, i) =>
              i === event.intervalIndex ? { ...interval, ...event.values } : interval,
            ),
          };
      }
    }) as WeeklyAvailability["days"],
  };
}

export const weeklyAvailabilityMachine = setup({
  types: {
    context: {} as Context,
    events: {} as
      | DraftEvent
      | { type: "saveRequested" | "retryLoad" | "retryInitialization" | "cancel" },
  },
  actors: {
    read: fromPromise(({ signal }: { signal: AbortSignal }) => readSchedule(signal)),
    initialize: fromPromise(({ signal }: { signal: AbortSignal }) => initializeTimeZone(signal)),
    save: fromPromise(({ input, signal }: { input: WeeklyAvailability; signal: AbortSignal }) =>
      saveWeek(input, signal),
    ),
  },
  actions: {
    edit: assign({
      week: ({ context, event }) =>
        context.week && "dayIndex" in event ? editWeek(context.week, event) : context.week,
      errors: {},
    }),
  },
}).createMachine({
  id: "weeklyAvailability",
  context: { week: null, errors: {} },
  initial: "loading",
  on: { cancel: { target: ".cancelled" } },
  states: {
    loading: {
      invoke: {
        src: "read",
        onDone: {
          target: "checkingTimeZone",
          actions: assign({
            week: ({ event }) => event.output.week,
            timeZone: ({ event }) => event.output.timeZone,
          }),
        },
        onError: "loadFailed",
      },
    },
    loadFailed: { on: { retryLoad: "loading" } },
    checkingTimeZone: {
      always: [
        { guard: ({ context }) => Boolean(context.timeZone), target: "editable" },
        { target: "initializing" },
      ],
    },
    initializing: {
      invoke: {
        src: "initialize",
        onDone: [
          {
            guard: ({ event }) => event.output.kind === "initialized",
            target: "editable",
            actions: assign({
              timeZone: ({ event }) =>
                event.output.kind === "initialized" ? event.output.timeZone : undefined,
            }),
          },
          {
            guard: ({ event }) => event.output.kind === "detectionFailed",
            target: "detectionFailed",
          },
          {
            guard: ({ event }) => event.output.kind === "rejected",
            target: "initializationRejected",
          },
          { target: "initializationUnknown" },
        ],
        onError: "initializationUnknown",
      },
    },
    detectionFailed: { on: { retryInitialization: "initializing" } },
    initializationRejected: { on: { retryInitialization: "initializing" } },
    initializationUnknown: { on: { retryInitialization: "initializing" } },
    editable: {
      initial: "editing",
      on: {
        dayBlocked: { target: ".editing", actions: "edit" },
        intervalAdded: { target: ".editing", actions: "edit" },
        intervalRemoved: { target: ".editing", actions: "edit" },
        intervalChanged: { target: ".editing", actions: "edit" },
        saveRequested: "validating",
      },
      states: { editing: {}, invalid: {}, rejected: {}, unknown: {}, saved: {} },
    },
    validating: {
      entry: assign({ errors: ({ context }) => validateWeek(context.week!) }),
      always: [
        {
          guard: ({ context }) => Object.keys(context.errors).length > 0,
          target: "editable.invalid",
        },
        { target: "saving" },
      ],
    },
    saving: {
      // Editing and repeated submission have no transition while the write is in flight.
      invoke: {
        src: "save",
        input: ({ context }) => context.week!,
        onDone: [
          {
            guard: ({ event }) => event.output.kind === "saved",
            target: "editable.saved",
            actions: assign({
              week: ({ context, event }) =>
                event.output.kind === "saved" ? event.output.week : context.week,
            }),
          },
          {
            guard: ({ event }) => event.output.kind === "rejected",
            target: "editable.rejected",
            actions: assign({
              errors: ({ event }) => (event.output.kind === "rejected" ? event.output.fields : {}),
            }),
          },
          { target: "editable.unknown" },
        ],
        onError: "editable.unknown",
      },
    },
    cancelled: { type: "final" },
  },
});
