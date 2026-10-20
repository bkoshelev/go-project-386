import { expect, test } from "./fixtures";

test("профиль и пустой каталог доступны без входа", async ({ request }) => {
  const owner = await request.get("/api/owner");
  expect(owner.status()).toBe(200);
  expect(await owner.json()).toEqual({ fullName: "Александр Иванов" });
  const catalog = await request.get("/api/event-types");
  expect(catalog.status()).toBe(200);
  expect(await catalog.json()).toEqual({ items: [] });
});

test("HTTP отклоняет неверные поля и не сохраняет их", async ({ request }) => {
  for (const [data, field] of [
    [{ name: " \t\n ", durationMinutes: 30 }, "/name"],
    [{ durationMinutes: 30 }, "/name"],
    [{ name: "Встреча" }, "/durationMinutes"],
    ...[0, -1, 1.5, 61, 90, 1390, 1440].map((durationMinutes) => [
      { name: "Встреча", durationMinutes },
      "/durationMinutes",
    ]),
    [{ name: "Встреча", durationMinutes: 30, id: "019a0ac0-1234-7abc-8def-0123456789ab" }, "/id"],
    [{ name: "Встреча", durationMinutes: 30, description: null }, "/description"],
  ] as const) {
    const response = await request.post("/api/admin/event-types", { data });
    expect(response.status(), JSON.stringify(data)).toBe(422);
    const failure = await response.json();
    expect(failure.code).toBe("validation_error");
    expect(failure.fields).toContainEqual(expect.objectContaining({ field }));
  }
  const broken = await request.post("/api/admin/event-types", {
    data: Buffer.from('{"name":'),
    headers: { "Content-Type": "application/json" },
  });
  expect(broken.status()).toBe(400);
  expect(await broken.json()).toMatchObject({ code: "bad_request" });
  expect(await (await request.get("/api/event-types")).json()).toEqual({ items: [] });
  const invalidID = await request.get("/api/event-types/not-a-uuid");
  expect(invalidID.status()).toBe(400);
  const missing = await request.get("/api/event-types/019a0ac0-1234-7abc-8def-0123456789ab");
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ code: "event_type_not_found" });
});

test("каталог полон и упорядочен по UUID при повторном чтении", async ({ request }) => {
  const saved = await Promise.all(
    Array.from({ length: 105 }, async (_, index) => {
      const response = await request.post("/api/admin/event-types", {
        data: { name: `Встреча ${index}`, durationMinutes: 30 },
      });
      expect(response.status()).toBe(201);
      return response.json();
    }),
  );
  const expected = { items: saved.sort((a, b) => a.id.localeCompare(b.id)) };
  for (let i = 0; i < 2; i++) {
    const response = await request.get("/api/event-types");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(expected);
  }
});

test("созданные типы читаются полностью и сохраняются после перезапуска", async ({
  request,
  backend,
}) => {
  const saved = [];
  for (const body of [
    { name: "  Знакомство  ", durationMinutes: 1 },
    { name: "Знакомство", description: "", durationMinutes: 60 },
    { name: "Обсуждение", description: "План встречи", durationMinutes: 120 },
    { name: "Длинная встреча", durationMinutes: 1380 },
  ]) {
    const response = await request.post("/api/admin/event-types", { data: body });
    expect(response.status()).toBe(201);
    const item = await response.json();
    expect(item).toEqual({
      ...body,
      name: body.name.trim(),
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
    });
    saved.push(item);
    const fetched = await request.get(`/api/event-types/${item.id}`);
    expect(fetched.status()).toBe(200);
    expect(await fetched.json()).toEqual(item);
  }
  expect(new Set(saved.map((item) => item.id)).size).toBe(4);
  await backend.restart();
  expect(await (await request.get("/api/event-types")).json()).toEqual({ items: saved });
  expect(await (await request.get("/api/owner")).json()).toEqual({ fullName: "Александр Иванов" });
});
