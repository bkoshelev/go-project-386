import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createActor as createActorV5, fromPromise } from "xstate-v5";
import { createActor as createActorV6, createAsyncLogic } from "xstate";
import { bookingMachine } from "../../frontend/src/features/book-selected-slot/model";
import { bookingMachineV6 } from "./booking";
import { client } from "../../frontend/src/api/generated/client.gen";
import type {
  BookingConfirmation,
  CreateBookingRequest,
  EventType,
} from "../../frontend/src/api/generated";
import type { SaveResult } from "../../frontend/src/features/book-selected-slot/workflows";

const event: EventType = { id: "event-1", name: "Consultation", durationMinutes: 30 };
const selection = {
  event,
  slot: { startsAt: "2027-01-01T10:00:00Z", endsAt: "2027-01-01T10:30:00Z" },
};
const confirmation: BookingConfirmation = {
  id: "0218c95a-535f-4cf0-8fe3-7390b05e5730",
  status: "confirmed",
  eventTypeId: event.id,
  eventTypeName: event.name,
  startsAt: selection.slot.startsAt,
  endsAt: selection.slot.endsAt,
};

type Event =
  | { type: "typeChosen"; id: string }
  | { type: "slotChosen"; selection: typeof selection }
  | { type: "guestChanged"; values: { name?: string; email?: string } }
  | { type: "backToTypes" | "backToTime" | "missingType" | "save" };

type Snapshot = {
  value: unknown;
  status: string;
  context: {
    eventTypeId: string | null;
    selection: typeof selection | null;
    guest: { name: string; email: string };
    errors: { name?: string; email?: string };
    notice: string;
    confirmation: BookingConfirmation | null;
  };
};
type Actor = {
  send: (event: Event) => void;
  getSnapshot: () => Snapshot;
  stop: () => void;
};
type Save = (input: CreateBookingRequest, signal: AbortSignal) => Promise<SaveResult>;
type Version = "v5" | "v6";

function makeActor(version: Version, save?: Save): Actor {
  if (version === "v5") {
    const machine = save
      ? bookingMachine.provide({
          actors: { save: fromPromise(({ input, signal }) => save(input, signal)) },
        })
      : bookingMachine;
    return createActorV5(machine).start() as unknown as Actor;
  }
  const machine = save
    ? bookingMachineV6.provide({
        actors: {
          save: createAsyncLogic<SaveResult, CreateBookingRequest>({
            run: ({ input, signal }) => save(input, signal),
          }),
        },
      })
    : bookingMachineV6;
  return createActorV6(machine).start() as unknown as Actor;
}

async function waitFor(actor: Actor, predicate: (snapshot: Snapshot) => boolean) {
  const deadline = Date.now() + 2_000;
  while (!predicate(actor.getSnapshot())) {
    if (Date.now() > deadline)
      throw new Error(`Timed out in ${JSON.stringify(actor.getSnapshot().value)}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  return actor.getSnapshot();
}

function toContacts(actor: Actor, guest = { name: " Anna ", email: " anna@example.com " }) {
  actor.send({ type: "typeChosen", id: event.id });
  actor.send({ type: "slotChosen", selection });
  actor.send({ type: "guestChanged", values: guest });
}

afterEach(() => client.setConfig({ baseUrl: "", fetch: globalThis.fetch }));

for (const version of ["v5", "v6"] as const) {
  await test(`${version}: invalid input never sends a request and retains the draft`, () => {
    let calls = 0;
    const actor = makeActor(version, async () => {
      calls++;
      return { kind: "unknown" };
    });
    try {
      toContacts(actor, { name: "", email: "invalid" });
      actor.send({ type: "save" });
      const snapshot = actor.getSnapshot();
      assert.deepEqual(snapshot.value, { contacts: "invalid" });
      assert.ok(snapshot.context.errors.name);
      assert.ok(snapshot.context.errors.email);
      assert.deepEqual(snapshot.context.guest, { name: "", email: "invalid" });
      assert.equal(calls, 0);
    } finally {
      actor.stop();
    }
  });

  await test(`${version}: save normalizes input and blocks repeated save and edits`, async () => {
    let resolve!: (value: SaveResult) => void;
    let calls = 0;
    let request: CreateBookingRequest | undefined;
    const pending = new Promise<SaveResult>((r) => {
      resolve = r;
    });
    const actor = makeActor(version, async (input) => {
      calls++;
      request = input;
      return pending;
    });
    try {
      toContacts(actor);
      actor.send({ type: "save" });
      actor.send({ type: "save" });
      actor.send({ type: "guestChanged", values: { name: "Other" } });
      assert.equal(actor.getSnapshot().value, "saving");
      assert.equal(calls, 1);
      assert.deepEqual(request, {
        eventTypeId: event.id,
        startsAt: selection.slot.startsAt,
        guest: { name: "Anna", email: "anna@example.com" },
      });
      resolve({ kind: "confirmed", confirmation });
      const snapshot = await waitFor(actor, (s) => s.value === "confirmed");
      assert.equal(snapshot.context.guest.name, " Anna ");
      assert.deepEqual(snapshot.context.confirmation, confirmation);
    } finally {
      actor.stop();
    }
  });

  const cases: {
    result: SaveResult;
    state: unknown;
    notice?: string;
    errors?: Snapshot["context"]["errors"];
  }[] = [
    {
      result: { kind: "conflict", message: "Slot occupied" },
      state: "time",
      notice: "Slot occupied",
    },
    {
      result: { kind: "missing" },
      state: "type",
      notice: "Тип события не найден. Выберите другой тип.",
    },
    {
      result: { kind: "invalid", errors: { email: "Server error" } },
      state: { contacts: "invalid" },
      errors: { email: "Server error" },
    },
    { result: { kind: "rejected" }, state: { contacts: "rejected" } },
    { result: { kind: "unknown" }, state: { contacts: "unknown" } },
  ];
  for (const { result, state, notice, errors } of cases) {
    await test(`${version}: ${result.kind} preserves guest data and selects the correct outcome`, async () => {
      let calls = 0;
      const actor = makeActor(version, async () => {
        calls++;
        return result;
      });
      try {
        toContacts(actor);
        actor.send({ type: "save" });
        const snapshot = await waitFor(
          actor,
          (s) => JSON.stringify(s.value) === JSON.stringify(state),
        );
        assert.deepEqual(snapshot.context.guest, { name: " Anna ", email: " anna@example.com " });
        if (notice) assert.equal(snapshot.context.notice, notice);
        if (errors) assert.deepEqual(snapshot.context.errors, errors);
        if (result.kind === "conflict" || result.kind === "missing")
          assert.equal(snapshot.context.selection, null);
        if (result.kind === "missing") assert.equal(snapshot.context.eventTypeId, null);
        assert.equal(snapshot.context.confirmation, null);
        assert.equal(calls, 1);
      } finally {
        actor.stop();
      }
    });
  }

  await test(`${version}: thrown error becomes unknown and only manual retry sends again`, async () => {
    let calls = 0;
    const actor = makeActor(version, async () => {
      calls++;
      if (calls === 1) throw new Error("connection lost");
      return { kind: "confirmed", confirmation };
    });
    try {
      toContacts(actor);
      actor.send({ type: "save" });
      await waitFor(
        actor,
        (s) => JSON.stringify(s.value) === JSON.stringify({ contacts: "unknown" }),
      );
      assert.equal(calls, 1);
      actor.send({ type: "save" });
      await waitFor(actor, (s) => s.value === "confirmed");
      assert.equal(calls, 2);
    } finally {
      actor.stop();
    }
  });

  await test(`${version}: returning to type selection resets slot but keeps guest`, () => {
    const actor = makeActor(version);
    try {
      toContacts(actor);
      actor.send({ type: "backToTime" });
      actor.send({ type: "backToTypes" });
      const snapshot = actor.getSnapshot();
      assert.equal(snapshot.value, "type");
      assert.equal(snapshot.context.selection, null);
      assert.equal(snapshot.context.eventTypeId, null);
      assert.equal(snapshot.context.guest.name, " Anna ");
    } finally {
      actor.stop();
    }
  });

  await test(`${version}: stopping the actor aborts in-flight work`, async () => {
    let signal: AbortSignal | undefined;
    let resolve!: (value: SaveResult) => void;
    const pending = new Promise<SaveResult>((r) => {
      resolve = r;
    });
    const actor = makeActor(version, async (_input, currentSignal) => {
      signal = currentSignal;
      return pending;
    });
    toContacts(actor);
    actor.send({ type: "save" });
    assert.equal(signal?.aborted, false);
    actor.stop();
    assert.equal(signal?.aborted, true);
    resolve({ kind: "confirmed", confirmation });
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(actor.getSnapshot().status, "stopped");
    assert.equal(actor.getSnapshot().context.confirmation, null);
  });

  const httpCases = [
    { label: "201 confirmation", status: 201, body: confirmation, state: "confirmed" },
    {
      label: "409 conflict",
      status: 409,
      body: { code: "time_occupied", message: "busy" },
      state: "time",
    },
    {
      label: "404 missing",
      status: 404,
      body: { code: "event_type_not_found", message: "missing" },
      state: "type",
    },
    {
      label: "422 validation",
      status: 422,
      body: { code: "validation_error", fields: [{ field: "/guest/email", message: "invalid" }] },
      state: { contacts: "invalid" },
    },
    {
      label: "500 rejection",
      status: 500,
      body: { code: "internal_error", message: "error" },
      state: { contacts: "rejected" },
    },
    { label: "malformed 201", status: 201, body: {}, state: { contacts: "unknown" } },
  ];
  for (const scenario of httpCases) {
    await test(`${version}: real API adapter maps ${scenario.label}`, async () => {
      let calls = 0;
      let body: unknown;
      client.setConfig({
        baseUrl: "http://booking.test",
        fetch: async (request) => {
          calls++;
          assert.ok(request instanceof Request);
          assert.equal(request.method, "POST");
          body = await request.json();
          return Response.json(scenario.body, { status: scenario.status });
        },
      });
      const actor = makeActor(version);
      try {
        toContacts(actor);
        actor.send({ type: "save" });
        const snapshot = await waitFor(
          actor,
          (s) => JSON.stringify(s.value) === JSON.stringify(scenario.state),
        );
        assert.equal(calls, 1);
        assert.deepEqual(body, {
          eventTypeId: event.id,
          startsAt: selection.slot.startsAt,
          guest: { name: "Anna", email: "anna@example.com" },
        });
        assert.equal(snapshot.context.guest.name, " Anna ");
        if (scenario.label === "201 confirmation")
          assert.deepEqual(snapshot.context.confirmation, confirmation);
        if (scenario.label === "422 validation")
          assert.equal(snapshot.context.errors.email, "invalid");
      } finally {
        actor.stop();
      }
    });
  }

  await test(`${version}: real API adapter maps a lost HTTP response to unknown without retry`, async () => {
    let calls = 0;
    client.setConfig({
      baseUrl: "http://booking.test",
      fetch: async () => {
        calls++;
        throw new TypeError("network lost");
      },
    });
    const actor = makeActor(version);
    try {
      toContacts(actor);
      actor.send({ type: "save" });
      const snapshot = await waitFor(
        actor,
        (s) => JSON.stringify(s.value) === JSON.stringify({ contacts: "unknown" }),
      );
      assert.equal(calls, 1);
      assert.equal(snapshot.context.confirmation, null);
      assert.equal(snapshot.context.guest.name, " Anna ");
    } finally {
      actor.stop();
    }
  });
}
