import { expect, test } from "@playwright/test";
import { createActor, waitFor } from "xstate";
import { client } from "../src/api/generated/client.gen";
import { dateAvailabilityMachine } from "../src/features/manage-date-availability/model";

test.afterEach(() => client.setConfig({ fetch: globalThis.fetch }));
test("режим даты очищает скрытые часы; неверные часы не отправляются на сервер", async () => {
  let writes = 0;
  client.setConfig({
    baseUrl: "http://schedule.test",
    fetch: async () => Response.json({ date: "2026-11-12", isBlocked: false }),
  });
  const actor = createActor(dateAvailabilityMachine, { input: { date: "2026-11-12" } }).start();
  try {
    await waitFor(actor, (state) => state.matches("editable"));
    actor.send({ type: "modeChanged", mode: "custom" });
    expect(actor.getSnapshot().context.draft).toEqual({ isBlocked: false, intervals: [] });
    actor.send({ type: "add" });
    client.setConfig({
      fetch: async () => {
        writes++;
        return Response.json({});
      },
    });
    actor.send({ type: "save" });
    expect(actor.getSnapshot().context.errors["/intervals/0/start"]).toBeTruthy();
    expect(writes).toBe(0);
    actor.send({ type: "modeChanged", mode: "blocked" });
    expect(actor.getSnapshot().context.draft).toEqual({ isBlocked: true });
    actor.send({ type: "modeChanged", mode: "inherit" });
    expect(actor.getSnapshot().context.draft).toEqual({ isBlocked: false });
  } finally {
    actor.stop();
  }
});
