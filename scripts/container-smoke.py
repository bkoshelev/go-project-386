#!/usr/bin/env python3
"""Exercise the production image in an isolated, disposable Compose project."""

import json
import os
from pathlib import Path
import re
import secrets
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS = ROOT / "artifacts/container-smoke"
PASSWORD = secrets.token_hex(24)
PROJECT = "calendar-smoke-" + uuid.uuid4().hex[:12]
ENV = {
    **os.environ,
    "POSTGRES_PASSWORD": PASSWORD,
    "APP_HOST_PORT": "0",
    "PORT": "10000",
    "COMPOSE_PROJECT_NAME": PROJECT,
    "COMPOSE_BAKE": "false",
}
COMPOSE = [
    "docker", "compose", "--project-name", PROJECT,
    "--file", str(ROOT / "compose.yaml"),
    "--file", str(ROOT / "compose.smoke.yaml"),
]


def redact(value):
    value = value.replace(PASSWORD, "[REDACTED]")
    return re.sub(r"postgres(?:ql)?://[^\s\"']+", "[DATABASE_URL]", value)


def run(args, *, check=True, timeout=120, env=ENV):
    result = subprocess.run(
        args, cwd=ROOT, env=env, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout,
    )
    with (ARTIFACTS / "operations.log").open("a") as output:
        output.write(redact(result.stdout))
    if check and result.returncode:
        raise RuntimeError(f"command failed ({result.returncode}); see operations.log")
    return result


def compose(*args, **kwargs):
    return run([*COMPOSE, *args], **kwargs)


def sql(query):
    return compose(
        "exec", "-T", "db", "psql", "-U", "calendar", "-d", "calendar",
        "-v", "ON_ERROR_STOP=1", "-Atc", query,
    ).stdout.strip()


def status(url):
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return response.status
    except urllib.error.HTTPError as error:
        error.close()
        return error.code
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return 0


def wait_status(url, expected, timeout=45):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if status(url) == expected:
            return
        time.sleep(0.2)
    raise RuntimeError(f"{url} did not return {expected}")


def base_url(service, port):
    address = compose("port", service, str(port)).stdout.strip()
    return "http://" + address


def assert_exit(service, expected):
    container = compose("ps", "--all", "--quiet", service).stdout.strip()
    result = run(["docker", "inspect", "--format", "{{json .State}}", container])
    state = json.loads(result.stdout)
    if state["Running"] or state["ExitCode"] != expected:
        raise RuntimeError(f"unexpected exit for {service}: {state['ExitCode']}")


def stop_signal(_number, _frame):
    raise RuntimeError("smoke interrupted")


def smoke():
    print(f"Building and testing isolated project {PROJECT}", flush=True)
    run(["docker", "info", "--format", "{{.ServerVersion}}"], timeout=15)
    compose("build", "app", "app2", timeout=900)
    image = PROJECT + "-app"
    image_env = run(["docker", "image", "inspect", "--format", "{{json .Config.Env}}", image]).stdout
    if any(item.startswith("PORT=") for item in json.loads(image_env)):
        raise RuntimeError("image contains a default PORT")
    without_port = {**ENV, "PORT": ""}
    config = compose("config", check=False, env=without_port)
    if config.returncode == 0:
        raise RuntimeError("Compose accepted a missing PORT")
    valid_dsn = "postgres://calendar:unused@db:5432/calendar?sslmode=disable"
    for variables, expected in [
        ([], "PORT"),
        (["-e", "HTTP_ADDR=0.0.0.0:9999", "-e", "DATABASE_URL=" + valid_dsn], "PORT"),
        (["-e", "PORT=", "-e", "DATABASE_URL=" + valid_dsn], "PORT"),
        (["-e", "PORT=  ", "-e", "DATABASE_URL=" + valid_dsn], "PORT"),
        (["-e", "PORT=bad", "-e", "HTTP_ADDR=0.0.0.0:9999", "-e", "DATABASE_URL=" + valid_dsn], "PORT"),
        (["-e", "PORT=10000"], "DATABASE_URL"),
        (["-e", "PORT=10000", "-e", "DATABASE_URL="], "DATABASE_URL"),
        (["-e", "PORT=10000", "-e", "DATABASE_URL=  "], "DATABASE_URL"),
    ]:
        result = run(["docker", "run", "--rm", "--network", "none", *variables, image], check=False)
        if result.returncode != 1 or expected not in result.stdout:
            raise RuntimeError(f"missing or invalid {expected} did not stop startup")
    compose("up", "-d", "--wait", "--wait-timeout", "60", "db")
    # Both instances start while the database is temporarily unavailable.
    compose("stop", "db")
    compose("up", "-d", "--no-deps", "app", "app2")
    first, second = base_url("app", 10000), base_url("app2", 8091)
    time.sleep(1)
    if status(first + "/healthz") != 0:
        raise RuntimeError("HTTP started before database preparation")
    compose("start", "db")
    wait_status(first + "/readyz", 200)
    wait_status(second + "/readyz", 200)
    for service, port in [("app", 10000), ("app2", 8091)]:
        for path in ("/", "/api/event-types", "/readyz"):
            compose("exec", "-T", "db", "wget", "-qO-", f"http://{service}:{port}{path}")
    other = compose("exec", "-T", "db", "wget", "-qO-", "http://app:9999/readyz", check=False)
    if other.returncode == 0:
        raise RuntimeError("HTTP_ADDR changed the listening port")
    if sql("SELECT count(*) FROM goose_db_version WHERE version_id=1 AND is_applied") != "1":
        raise RuntimeError("migration was not applied exactly once")
    sql("INSERT INTO example_records(value) VALUES ('container-smoke-persistence')")
    print("Checking Chromium and same-origin HTTP", flush=True)
    run([
        "node", "frontend/node_modules/@playwright/test/cli.js", "test",
        "--config", "frontend/playwright.container.config.ts",
    ], env={**ENV, "CONTAINER_BASE_URL": first}, timeout=120)
    run(
        ["docker", "run", "--rm", "--network", PROJECT + "_default",
         "-e", "DATABASE_URL", image, "/app/migrate", "status"],
        env={**ENV, "DATABASE_URL": f"postgres://calendar:{PASSWORD}@db:5432/calendar?sslmode=disable"},
    )
    for dsn in ["", "postgres://user:hidden@db:invalid/private"]:
        invalid = compose(
            "run", "--rm", "--no-deps", "-T", "-e", "DATABASE_URL=" + dsn,
            "app", check=False,
        )
        if invalid.returncode != 1 or "DATABASE_URL" not in invalid.stdout:
            raise RuntimeError("invalid database configuration did not stop startup")
        if "hidden" in invalid.stdout or "private" in invalid.stdout:
            raise RuntimeError("invalid configuration leaked connection details")
    compose("restart", "app")
    first = base_url("app", 10000)
    wait_status(first + "/readyz", 200)
    if sql("SELECT value FROM example_records") != "container-smoke-persistence":
        raise RuntimeError("restart lost stored data")
    print("Checking database outage, recovery and SIGTERM", flush=True)
    compose("stop", "db")
    wait_status(first + "/readyz", 503)
    wait_status(first + "/healthz", 200)
    compose("start", "db")
    wait_status(first + "/readyz", 200)
    # stop uses SIGTERM; a forced SIGKILL would produce exit code 137.
    compose("stop", "--timeout", "15", "app", "app2")
    assert_exit("app", 0)
    assert_exit("app2", 0)
    compose("stop", "db")
    compose("up", "-d", "--no-deps", "app")
    time.sleep(1)
    if not compose("ps", "--status", "running", "--quiet", "app").stdout.strip():
        raise RuntimeError("application exited instead of waiting for the database")
    if status(base_url("app", 10000) + "/healthz") != 0:
        raise RuntimeError("HTTP started while the database was unavailable")
    compose("stop", "--timeout", "5", "app")
    assert_exit("app", 1)


def main():
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "operations.log").write_text("")
    signal.signal(signal.SIGTERM, stop_signal)
    signal.signal(signal.SIGINT, stop_signal)
    failed = False
    try:
        smoke()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        failed = True
        print(redact(str(error)), file=sys.stderr)
    finally:
        # Every command is scoped to the unique project, including failure cleanup.
        try:
            logs = compose("logs", "--no-color", check=False, timeout=20)
            (ARTIFACTS / "compose.log").write_text(redact(logs.stdout))
        except (OSError, subprocess.SubprocessError) as error:
            print(redact(str(error)), file=sys.stderr)
        try:
            cleanup = compose("down", "--volumes", "--remove-orphans", "--rmi", "local", check=False, timeout=60)
            failed = failed or cleanup.returncode != 0
        except (OSError, subprocess.SubprocessError) as error:
            failed = True
            print(redact(str(error)), file=sys.stderr)
    if failed:
        print(f"Diagnostics: {ARTIFACTS}", file=sys.stderr)
        return 1
    print("Container smoke passed; isolated resources removed", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
