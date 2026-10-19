import { expect, test } from "@playwright/test";
import { getHealth } from "../src/api/generated";

test("сгенерированный клиент запрашивает healthz и читает JSON-ответ", async () => {
  let request: Request | undefined;
  const result = await getHealth({
    baseUrl: "https://api.example.test",
    fetch: async (input) => {
      request = input as Request;
      return Response.json({ status: "ok" });
    },
  });

  expect(request?.method).toBe("GET");
  expect(request?.url).toBe("https://api.example.test/healthz");
  expect(result.data).toEqual({ status: "ok" });
  expect(result.error).toBeUndefined();
});

test("сгенерированный клиент сообщает об ошибке HTTP", async () => {
  const result = await getHealth({
    baseUrl: "https://api.example.test",
    fetch: async () => new Response("unavailable", { status: 503 }),
  });

  expect(result.response?.status).toBe(503);
  expect(result.data).toBeUndefined();
  expect(result.error).toBe("unavailable");
});
