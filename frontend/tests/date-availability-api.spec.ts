import { expect, test } from "./fixtures";

test("независимые настройки дат сохраняются после конкурентных замен и перезапуска", async ({
  request,
  backend,
}) => {
  expect(
    (
      await request.post("/api/admin/scheduling-settings/time-zone", {
        data: { timeZone: "Europe/Moscow" },
      })
    ).status(),
  ).toBe(200);
  const dates = ["2026-10-19", "2026-10-20"];
  const values = [{ isBlocked: false, intervals: [] }, { isBlocked: true }];
  await Promise.all(
    dates.map(async (date, index) => {
      const response = await request.put(`/api/admin/availability/dates/${date}`, {
        data: values[index],
      });
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ date, ...values[index] });
    }),
  );
  await backend.restart();
  for (const [index, date] of dates.entries()) {
    expect(await (await request.get(`/api/admin/availability/dates/${date}`)).json()).toEqual({
      date,
      ...values[index],
    });
  }
  expect(await (await request.get("/api/admin/availability/dates/2026-10-21")).json()).toEqual({
    date: "2026-10-21",
    isBlocked: false,
  });
});
