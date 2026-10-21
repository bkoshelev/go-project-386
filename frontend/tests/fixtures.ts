import { execFile, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { test as base, expect } from "@playwright/test";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "../..");

type Environment = { directory: string; container: string; databasePort: string };
type Backend = {
  url: string;
  restart: () => Promise<void>;
  database: (running: boolean) => Promise<void>;
};

export const test = base.extend<{ backend: Backend }, { environment: Environment }>({
  environment: [
    // Playwright requires a destructured dependency object, even with no dependencies.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provide) => {
      const directory = await mkdtemp(resolve(tmpdir(), "calendar-browser-"));
      const databasePort = String(await availablePort());
      const container = `calendar-browser-${randomUUID()}`;
      try {
        await execute("go", ["build", "-o", resolve(directory, "server"), "./cmd/server"], {
          cwd: resolve(root, "backend"),
          env: { ...process.env, GOTOOLCHAIN: "local" },
        });
        await symlink(resolve(root, "frontend/dist"), resolve(directory, "frontend"));
        await execute("docker", [
          "run",
          "--detach",
          "--name",
          container,
          "-e",
          "POSTGRES_PASSWORD=browser_test",
          "-p",
          `127.0.0.1:${databasePort}:5432`,
          "postgres:18.6-alpine",
        ]);
        await expect
          .poll(
            async () => {
              try {
                await execute("docker", [
                  "exec",
                  container,
                  "pg_isready",
                  "-h",
                  "127.0.0.1",
                  "-U",
                  "postgres",
                ]);
                return true;
              } catch {
                return false;
              }
            },
            { timeout: 30_000 },
          )
          .toBe(true);
        await provide({ directory, container, databasePort });
      } finally {
        try {
          await execute("docker", ["rm", "--force", "--volumes", container]);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    },
    { scope: "worker", timeout: 120_000 },
  ],
  backend: async ({ environment }, provide, testInfo) => {
    const databaseName = `test_${randomUUID().replaceAll("-", "")}`;
    const port = await availablePort();
    const url = `http://127.0.0.1:${port}`;
    let processHandle: ChildProcess | undefined;
    let logs = "";
    const stop = async () => {
      if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
        const exited = once(processHandle, "exit");
        processHandle.kill("SIGTERM");
        await exited;
      }
    };
    const waitUntilReady = async () => {
      await expect
        .poll(
          async () => {
            try {
              return (await fetch(`${url}/readyz`)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 30_000 },
        )
        .toBe(200);
    };
    const start = async () => {
      processHandle = spawn(resolve(environment.directory, "server"), [], {
        cwd: environment.directory,
        env: {
          ...process.env,
          HTTP_ADDR: `127.0.0.1:${port}`,
          DATABASE_URL: `postgres://postgres:browser_test@127.0.0.1:${environment.databasePort}/${databaseName}?sslmode=disable`,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      processHandle.stdout?.on("data", (chunk: Buffer) => {
        logs += chunk.toString();
      });
      processHandle.stderr?.on("data", (chunk: Buffer) => {
        logs += chunk.toString();
      });
      await waitUntilReady();
    };
    try {
      await execute("docker", [
        "exec",
        environment.container,
        "createdb",
        "-U",
        "postgres",
        databaseName,
      ]);
      await start();
      await provide({
        url,
        restart: async () => {
          await stop();
          await start();
        },
        database: async (running) => {
          await execute("docker", [running ? "start" : "stop", environment.container]);
          if (running) await waitUntilReady();
        },
      });
    } finally {
      try {
        // Always stop the backend, including when Docker cannot recover.
        await stop();
      } finally {
        try {
          await execute("docker", ["start", environment.container]);
          await execute("docker", [
            "exec",
            environment.container,
            "dropdb",
            "-U",
            "postgres",
            "--force",
            "--if-exists",
            databaseName,
          ]);
        } finally {
          if (testInfo.status !== testInfo.expectedStatus) {
            await testInfo.attach("backend.log", { body: logs, contentType: "text/plain" });
          }
        }
      }
    }
  },
  baseURL: async ({ backend }, provide) => {
    await provide(backend.url);
  },
});

export { expect };

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((done) => reservation.close(() => done()));
  return address.port;
}
