import { assign, fromPromise, setup } from "xstate";
import type { CreateEventTypeRequest } from "../../api/generated";
import { saveEventType, type FieldErrors } from "./transport";

type Draft = {
  name: string;
  description: string;
  duration: string;
  unit: "minutes" | "hours";
};

type CreationInput = { onCreated: () => void };
type CreationContext = CreationInput & { draft: Draft; errors: FieldErrors };

export function getDurationLimit(unit: Draft["unit"]) {
  return unit === "hours" ? 23 : 60;
}

function validate(draft: Draft): FieldErrors {
  const errors: FieldErrors = {};
  const limit = getDurationLimit(draft.unit);
  const duration = Number(draft.duration);
  if (!draft.name.trim()) errors.name = "Введите название";
  if (!Number.isInteger(duration) || duration < 1 || duration > limit) {
    errors.durationMinutes = `Введите целое число от 1 до ${limit}`;
  }
  return errors;
}

function normalize(draft: Draft): CreateEventTypeRequest {
  return {
    name: draft.name.trim(),
    ...(draft.description ? { description: draft.description } : {}),
    durationMinutes: Number(draft.duration) * (draft.unit === "hours" ? 60 : 1),
  };
}

export const creationMachine = setup({
  types: {
    context: {} as CreationContext,
    input: {} as CreationInput,
    events: {} as { type: "saveRequested" } | { type: "draftChanged"; values: Partial<Draft> },
  },
  actors: {
    save: fromPromise(({ input, signal }: { input: CreateEventTypeRequest; signal: AbortSignal }) =>
      saveEventType(input, signal),
    ),
  },
}).createMachine({
  id: "createEventType",
  context: ({ input }) => ({
    ...input,
    draft: { name: "", description: "", duration: "", unit: "minutes" },
    errors: {},
  }),
  initial: "editable",
  states: {
    editable: {
      initial: "editing",
      on: {
        draftChanged: {
          actions: assign({
            draft: ({ context, event }) => ({ ...context.draft, ...event.values }),
          }),
        },
        saveRequested: { target: "validating" },
      },
      states: {
        editing: {},
        invalid: {},
        rejected: {},
        unknown: {},
        created: {
          entry: [
            assign({
              draft: ({ context }) => ({
                ...context.draft,
                name: "",
                description: "",
                duration: "",
              }),
            }),
            ({ context }) => context.onCreated(),
          ],
        },
      },
    },
    validating: {
      entry: assign({ errors: ({ context }) => validate(context.draft) }),
      always: [
        {
          guard: ({ context }) => Object.keys(context.errors).length > 0,
          target: "editable.invalid",
        },
        { target: "saving" },
      ],
    },
    saving: {
      // No saveRequested or draftChanged transition: the actor ignores repeats synchronously.
      invoke: {
        src: "save",
        input: ({ context }) => normalize(context.draft),
        onDone: [
          { guard: ({ event }) => event.output.kind === "created", target: "editable.created" },
          {
            guard: ({ event }) => event.output.kind === "rejected",
            target: "editable.rejected",
            actions: assign({
              errors: ({ event }) => (event.output.kind === "rejected" ? event.output.fields : {}),
            }),
          },
          { target: "editable.unknown" },
        ],
        onError: { target: "editable.unknown" },
      },
    },
  },
});
