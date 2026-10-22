import { assign, fromPromise, setup } from "xstate";
import { localDate, windowDates } from "./dates";
import { readFreeTime, type FreeTime } from "./workflows";

type Input = { eventTypeId: string };
type Context = Input & { data: FreeTime | null; date: string; selected: string };

function refreshedDate(date: string, data: FreeTime) {
  const dates = windowDates(data.availability);
  return dates.includes(date)
    ? date
    : data.availability.slots[0]
      ? localDate(new Date(data.availability.slots[0].startsAt))
      : dates[0];
}

export const freeTimeMachine = setup({
  types: {
    input: {} as Input,
    context: {} as Context,
    events: {} as
      | { type: "refresh" | "cancel" }
      | { type: "eventTypeChanged"; eventTypeId: string }
      | { type: "dateChanged"; date: string }
      | { type: "slotSelected"; startsAt: string },
  },
  actors: {
    read: fromPromise(({ input, signal }: { input: string; signal: AbortSignal }) =>
      readFreeTime(input, signal),
    ),
  },
}).createMachine({
  id: "freeTime",
  initial: "loading",
  context: ({ input }) => ({ ...input, data: null, date: "", selected: "" }),
  on: {
    eventTypeChanged: {
      guard: ({ context, event }) => context.eventTypeId !== event.eventTypeId,
      target: ".loading",
      reenter: true,
      actions: assign({
        eventTypeId: ({ event }) => event.eventTypeId,
        date: "",
        selected: "",
        data: null,
      }),
    },
    refresh: { target: ".loading", reenter: true, actions: assign({ selected: "", data: null }) },
    cancel: { target: ".cancelled", actions: assign({ selected: "", data: null }) },
  },
  states: {
    loading: {
      invoke: {
        src: "read",
        input: ({ context }) => context.eventTypeId,
        onDone: [
          {
            guard: ({ event }) => event.output === null,
            target: "missing",
            actions: assign({ data: null, selected: "" }),
          },
          {
            target: "ready",
            actions: assign({
              data: ({ event }) => event.output,
              date: ({ context, event }) => refreshedDate(context.date, event.output!),
              selected: "",
            }),
          },
        ],
        onError: "failed",
      },
    },
    failed: {},
    missing: {},
    ready: {
      on: {
        dateChanged: {
          guard: ({ context, event }) =>
            Boolean(context.data && windowDates(context.data.availability).includes(event.date)),
          actions: assign({ date: ({ event }) => event.date, selected: "" }),
        },
        slotSelected: {
          guard: ({ context, event }) =>
            Boolean(
              context.data?.availability.slots.some(
                (slot) =>
                  slot.startsAt === event.startsAt &&
                  localDate(new Date(slot.startsAt)) === context.date,
              ),
            ),
          actions: assign({ selected: ({ event }) => event.startsAt }),
        },
      },
    },
    cancelled: { type: "final" },
  },
});
