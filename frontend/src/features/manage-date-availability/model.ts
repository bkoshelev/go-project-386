import { assign, fromPromise, setup } from "xstate";
import type { AvailabilityTimeRange, UpdateDateAvailabilityRequest } from "../../api/generated";
import { readDate, saveDate } from "./workflows";

type DraftEvent =
  | { type: "blocked"; value: boolean }
  | { type: "custom"; value: boolean }
  | { type: "add" }
  | { type: "remove"; index: number }
  | { type: "change"; index: number; values: Partial<AvailabilityTimeRange> };
type Context = {
  date: string;
  draft: UpdateDateAvailabilityRequest | null;
  errors: Record<string, string>;
};

function edit(
  draft: UpdateDateAvailabilityRequest,
  event: DraftEvent,
): UpdateDateAvailabilityRequest {
  switch (event.type) {
    case "blocked":
      return { isBlocked: event.value };
    case "custom":
      return event.value ? { ...draft, intervals: [] } : { isBlocked: draft.isBlocked };
    case "add":
      return { ...draft, intervals: [...(draft.intervals ?? []), { start: "", end: "" }] };
    case "remove":
      return { ...draft, intervals: draft.intervals?.filter((_, i) => i !== event.index) };
    case "change":
      return {
        ...draft,
        intervals: draft.intervals?.map((value, i) =>
          i === event.index ? { ...value, ...event.values } : value,
        ),
      };
  }
}

export const dateAvailabilityMachine = setup({
  types: {
    context: {} as Context,
    input: {} as { date: string },
    events: {} as DraftEvent | { type: "dateChanged"; date: string } | { type: "save" | "reload" },
  },
  actors: {
    read: fromPromise(({ input, signal }: { input: string; signal: AbortSignal }) =>
      readDate(input, signal),
    ),
    save: fromPromise(
      ({
        input,
        signal,
      }: {
        input: { date: string; draft: UpdateDateAvailabilityRequest };
        signal: AbortSignal;
      }) => saveDate(input.date, input.draft, signal),
    ),
  },
  actions: {
    edit: assign({
      draft: ({ context, event }) =>
        context.draft ? edit(context.draft, event as DraftEvent) : null,
      errors: {},
    }),
  },
}).createMachine({
  id: "dateAvailability",
  context: ({ input }) => ({ date: input.date, draft: null, errors: {} }),
  initial: "loading",
  on: {
    dateChanged: {
      target: ".choosing",
      reenter: true,
      actions: assign({ date: ({ event }) => event.date, draft: null, errors: {} }),
    },
  },
  states: {
    choosing: {
      always: [
        { guard: ({ context }) => /^\d{4}-\d{2}-\d{2}$/.test(context.date), target: "loading" },
      ],
    },
    loading: {
      entry: assign({ draft: null, errors: {} }),
      invoke: {
        src: "read",
        input: ({ context }) => context.date,
        onDone: {
          target: "editable",
          actions: assign({
            draft: ({ event }) => ({
              isBlocked: event.output.isBlocked,
              ...(event.output.intervals === undefined
                ? {}
                : { intervals: event.output.intervals }),
            }),
          }),
        },
        onError: "loadFailed",
      },
    },
    loadFailed: { on: { reload: "loading" } },
    editable: {
      initial: "editing",
      on: {
        blocked: { target: ".editing", actions: "edit" },
        custom: { target: ".editing", actions: "edit" },
        add: { target: ".editing", actions: "edit" },
        remove: { target: ".editing", actions: "edit" },
        change: { target: ".editing", actions: "edit" },
        reload: "loading",
        save: "saving",
      },
      states: { editing: {}, saved: {}, rejected: {}, unknown: {} },
    },
    saving: {
      on: { dateChanged: {} },
      invoke: {
        src: "save",
        input: ({ context }) => ({ date: context.date, draft: context.draft! }),
        onDone: [
          {
            guard: ({ event }) => event.output.kind === "saved",
            target: "editable.saved",
            actions: assign({
              draft: ({ context, event }) =>
                event.output.kind === "saved"
                  ? {
                      isBlocked: event.output.value.isBlocked,
                      ...(event.output.value.intervals === undefined
                        ? {}
                        : { intervals: event.output.value.intervals }),
                    }
                  : context.draft,
              errors: {},
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
  },
});
