import { expect, test } from "@playwright/test";
import { createActor, waitFor } from "xstate";
import { client } from "../src/api/generated/client.gen";
import type { WeeklyAvailability } from "../src/api/generated";
import { freeTimeMachine } from "../src/features/choose-free-time/model";
import { weeklyAvailabilityMachine } from "../src/features/manage-weekly-availability/model";

const week: WeeklyAvailability = {
  days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
    (weekday) => ({ weekday, isBlocked: false, intervals: [{ start: "09:00", end: "18:00" }] }),
  ) as WeeklyAvailability["days"],
};

test.afterEach(() => client.setConfig({ fetch: globalThis.fetch }));

test("saving ignores repeat submission and draft changes until a confirmed response", async () => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  client.setConfig({
    baseUrl: "http://scheduling.test",
    fetch: async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
      if (request.method === "PUT") return pending;
      return Response.json(
        request.url.endsWith("/weekly") ? week : { timeZone: "UTC", meetingPauseMinutes: 0 },
      );
    },
  });
  const actor = createActor(weeklyAvailabilityMachine).start();
  try {
    await waitFor(actor, (state) => state.matches("editable"));
    actor.send({ type: "saveRequested" });
    actor.send({
      type: "intervalChanged",
      dayIndex: 0,
      intervalIndex: 0,
      values: { start: "10:00" },
    });
    actor.send({ type: "saveRequested" });
    expect(actor.getSnapshot().context.week?.days[0].intervals[0].start).toBe("09:00");
    release(Response.json(week));
    await waitFor(actor, (state) => state.matches({ editable: "saved" }));
    expect(actor.getSnapshot().context.week).toEqual(week);
  } finally {
    actor.stop();
  }
});

for (const outcome of ["rejected", "unknown", "invalid-success"] as const) {
  test(`${outcome} keeps the draft and allows only a manual retry`, async () => {
    client.setConfig({
      baseUrl: "http://scheduling.test",
      fetch: async (request) => {
        if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
        if (request.method === "PUT") {
          if (outcome === "unknown") throw new TypeError("Connection lost after commit");
          if (outcome === "invalid-success") return Response.json({});
          return Response.json(
            {
              code: "validation_error",
              fields: [{ field: "/days/0/intervals/0/end", message: "Ошибка интервала" }],
            },
            { status: 422 },
          );
        }
        return Response.json(
          request.url.endsWith("/weekly") ? week : { timeZone: "UTC", meetingPauseMinutes: 0 },
        );
      },
    });
    const actor = createActor(weeklyAvailabilityMachine).start();
    try {
      await waitFor(actor, (state) => state.matches("editable"));
      actor.send({
        type: "intervalChanged",
        dayIndex: 0,
        intervalIndex: 0,
        values: { start: "10:00" },
      });
      actor.send({ type: "saveRequested" });
      await waitFor(actor, (state) =>
        state.matches({ editable: outcome === "rejected" ? "rejected" : "unknown" }),
      );
      expect(actor.getSnapshot().context.week?.days[0].intervals[0]).toEqual({
        start: "10:00",
        end: "18:00",
      });
      if (outcome === "rejected")
        expect(actor.getSnapshot().context.errors).toEqual({
          "/days/0/intervals/0/end": "Ошибка интервала",
        });
      actor.send({
        type: "intervalChanged",
        dayIndex: 0,
        intervalIndex: 0,
        values: { end: "17:00" },
      });
      expect(actor.getSnapshot().context.week?.days[0].intervals[0].end).toBe("17:00");
    } finally {
      actor.stop();
    }
  });
}

test("cancelling a write ignores its late success", async () => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  client.setConfig({
    baseUrl: "http://scheduling.test",
    fetch: async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
      if (request.method === "PUT") return pending;
      return Response.json(
        request.url.endsWith("/weekly") ? week : { timeZone: "UTC", meetingPauseMinutes: 0 },
      );
    },
  });
  const actor = createActor(weeklyAvailabilityMachine).start();
  try {
    await waitFor(actor, (state) => state.matches("editable"));
    actor.send({ type: "saveRequested" });
    actor.send({ type: "cancel" });
    release(
      Response.json({ ...week, days: week.days.map((day) => ({ ...day, isBlocked: true })) }),
    );
    await pending;
    // Flush the network continuation after the cancelled invocation has resolved.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(actor.getSnapshot().matches("cancelled")).toBe(true);
    expect(actor.getSnapshot().context.week).toEqual(week);
  } finally {
    actor.stop();
  }
});

const availability = {
  eventTypeId: "first",
  generatedAt: "2026-10-19T08:00:00Z",
  windowStartsAt: "2026-10-19T00:00:00Z",
  windowEndsAt: "2026-11-02T00:00:00Z",
  slots: [{ startsAt: "2026-10-20T09:00:00Z", endsAt: "2026-10-20T09:30:00Z" }],
};

test("date changes and refresh clear the chosen slot while keeping an in-window date", async () => {
  client.setConfig({
    baseUrl: "http://scheduling.test",
    fetch: async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
      return Response.json(
        request.url.endsWith("/availability")
          ? availability
          : { id: "first", name: "Call", durationMinutes: 30 },
      );
    },
  });
  const actor = createActor(freeTimeMachine, { input: { eventTypeId: "first" } }).start();
  try {
    await waitFor(actor, (state) => state.matches("ready"));
    const date = actor.getSnapshot().context.date;
    actor.send({ type: "slotSelected", startsAt: availability.slots[0].startsAt });
    expect(actor.getSnapshot().context.selected).toBe(availability.slots[0].startsAt);
    actor.send({ type: "dateChanged", date });
    expect(actor.getSnapshot().context.selected).toBe("");
    actor.send({ type: "slotSelected", startsAt: availability.slots[0].startsAt });
    actor.send({ type: "refresh" });
    expect(actor.getSnapshot().context.selected).toBe("");
    await waitFor(actor, (state) => state.matches("ready"));
    expect(actor.getSnapshot().context.date).toBe(date);
    expect(actor.getSnapshot().context.selected).toBe("");
  } finally {
    actor.stop();
  }
});

test("changing event type ignores an old availability response and clears selection", async () => {
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  client.setConfig({
    baseUrl: "http://scheduling.test",
    fetch: async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
      if (request.url.endsWith("/first/availability")) return pending;
      return Response.json(
        request.url.endsWith("/availability")
          ? { ...availability, eventTypeId: "second", slots: [] }
          : { id: "second", name: "Second", durationMinutes: 15 },
      );
    },
  });
  const actor = createActor(freeTimeMachine, { input: { eventTypeId: "first" } }).start();
  try {
    actor.send({ type: "slotSelected", startsAt: availability.slots[0].startsAt });
    expect(actor.getSnapshot().context.selected).toBe("");
    actor.send({ type: "eventTypeChanged", eventTypeId: "second" });
    await waitFor(actor, (state) => state.matches("ready"));
    const currentDate = actor.getSnapshot().context.date;
    release(Response.json(availability));
    await pending;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(actor.getSnapshot().context.data?.event.id).toBe("second");
    expect(actor.getSnapshot().context.data?.availability.slots).toEqual([]);
    expect(actor.getSnapshot().context.date).toBe(currentDate);
    expect(actor.getSnapshot().context.selected).toBe("");
  } finally {
    actor.stop();
  }
});

test("refresh moves an expired date into the new window and cancel clears the slot", async () => {
  let current = availability;
  client.setConfig({
    baseUrl: "http://scheduling.test",
    fetch: async (request) => {
      if (!(request instanceof Request)) throw new Error("Expected an HTTP request");
      return Response.json(
        request.url.endsWith("/availability")
          ? current
          : { id: "first", name: "Call", durationMinutes: 30 },
      );
    },
  });
  const actor = createActor(freeTimeMachine, { input: { eventTypeId: "first" } }).start();
  try {
    await waitFor(actor, (state) => state.matches("ready"));
    const previousDate = actor.getSnapshot().context.date;
    current = {
      ...availability,
      windowStartsAt: "2026-11-03T00:00:00Z",
      windowEndsAt: "2026-11-17T00:00:00Z",
      slots: [{ startsAt: "2026-11-04T09:00:00Z", endsAt: "2026-11-04T09:30:00Z" }],
    };
    actor.send({ type: "refresh" });
    await waitFor(actor, (state) => state.matches("ready"));
    expect(actor.getSnapshot().context.date).not.toBe(previousDate);
    actor.send({ type: "slotSelected", startsAt: current.slots[0].startsAt });
    expect(actor.getSnapshot().context.selected).toBe(current.slots[0].startsAt);
    actor.send({ type: "cancel" });
    expect(actor.getSnapshot().context.selected).toBe("");
    expect(actor.getSnapshot().context.data).toBeNull();
  } finally {
    actor.stop();
  }
});
