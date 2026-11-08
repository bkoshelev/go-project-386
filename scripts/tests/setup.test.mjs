import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("explicit setup rejects an invalid verification mode before preparation", () => {
  const result = spawnSync("mise", ["run", "setup"], {
    env: { ...process.env, SETUP_VERIFY: "invalid", MISE_NO_HOOKS: "1" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SETUP_VERIFY must be 0 or 1/u);
});

test("Orca bootstrap reports a missing mise without requiring shell activation", () => {
  const result = spawnSync("/bin/bash", ["scripts/setup-worktree.sh"], {
    env: { ...process.env, PATH: "/usr/bin:/bin", ORCA_WORKTREE_PATH: process.cwd() },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Install mise 2026\.10\.17/u);
});

test("mise resolves exact Go, Node.js and pnpm versions without language version files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "mise versions "));
  const env = { ...process.env, MISE_NO_HOOKS: "1" };
  try {
    cpSync("mise.toml", join(cwd, "mise.toml"));
    assert.equal(spawnSync("mise", ["trust", join(cwd, "mise.toml")], { cwd, env }).status, 0);
    const result = spawnSync("mise", ["ls", "--current", "--json", "go", "node", "pnpm"], {
      cwd,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const tools = JSON.parse(result.stdout);
    assert.equal(tools.length, 3);
    for (const tool of tools) {
      assert.equal(tool.active, true);
      assert.match(tool.requested_version, /^\d+\.\d+\.\d+$/u);
      assert.equal(tool.version, tool.requested_version);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("worktree dotenv overrides stay isolated and cannot enable Go toolchain switching", () => {
  const dir = mkdtempSync(join(tmpdir(), "mise env "));
  const env = { ...process.env, GOTOOLCHAIN: "auto", MISE_NO_HOOKS: "1" };
  try {
    for (const name of ["first", "second"]) {
      const cwd = join(dir, name);
      for (const file of [
        "mise.toml",
        "backend/go.mod",
        "frontend/.nvmrc",
        "frontend/package.json",
      ]) {
        mkdirSync(join(cwd, file, ".."), { recursive: true });
        cpSync(file, join(cwd, file));
      }
      assert.equal(spawnSync("mise", ["trust", join(cwd, "mise.toml")], { cwd, env }).status, 0);
      const read = () =>
        spawnSync(
          "mise",
          [
            "exec",
            "node",
            "--",
            "node",
            "-e",
            "console.log(JSON.stringify([process.env.WORKTREE_PROBE ?? null, process.env.GOTOOLCHAIN]))",
          ],
          { cwd, env, encoding: "utf8" },
        );
      let result = read();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), [null, "local"]);
      writeFileSync(join(cwd, ".env.local"), `WORKTREE_PROBE=${name}\nGOTOOLCHAIN=auto\n`);
      result = read();
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), [name, "local"]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
