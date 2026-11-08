import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function check(message, pr = false) {
  const dir = mkdtempSync(join(tmpdir(), "commit-check-"));
  try {
    const file = join(dir, "input");
    writeFileSync(file, pr ? JSON.stringify({ pull_request: { title: message } }) : message);
    return spawnSync("mise", ["run", "commit:check", "--", ...(pr ? ["--pr-event"] : []), file], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("shared message command accepts release-policy types without changing the message", () => {
  const dir = mkdtempSync(join(tmpdir(), "commit messages "));
  try {
    const file = join(dir, "message ' $().txt");
    const message = "feature(frontend)!: change booking flow\n\nBREAKING CHANGE: new flow\n";
    writeFileSync(file, message);
    const result = spawnSync("mise", ["run", "commit:check", "--", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), message);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("all release-policy types and scope/breaking headers are accepted", () => {
  const policy = JSON.parse(
    readFileSync(new URL("../../release-please-config.json", import.meta.url)),
  );
  for (const { type } of policy.packages["."]["changelog-sections"]) {
    const result = check(`${type}(backend)!: change behavior`);
    assert.equal(result.status, 0, result.stderr);
  }
});

test("invalid messages are rejected, while local Git-generated messages are accepted", () => {
  for (const title of ["no type", "unknown: change", "feat: ", "feat(scope):"]) {
    assert.notEqual(check(title).status, 0, title);
  }
  for (const title of [
    "fixup! feat: change",
    "squash! fix: change",
    "Merge branch 'topic'",
    'Revert "change"',
  ]) {
    assert.equal(check(title).status, 0, title);
  }
});

test("PR titles reject Git exceptions and multiline input and treat shell syntax as data", () => {
  for (const title of [
    "fixup! feat: change",
    "squash! fix: change",
    "amend! fix: change",
    "Merge branch 'topic'",
    'Revert "change"',
    "feat: title\nfix: body",
  ]) {
    assert.notEqual(check(title, true).status, 0, title);
  }
  assert.equal(check("deps(api)!: update $() `printf injected` 'quotes'", true).status, 0);
});

test("installed repository hook checks real commits, installs only commit-msg and preserves global config", () => {
  const dir = mkdtempSync(join(tmpdir(), "hook repo ' $() "));
  const repo = join(dir, "repo");
  const global = join(dir, "gitconfig");
  mkdirSync(repo);
  writeFileSync(global, "[user]\n\tname = Test\n\temail = test@example.test\n");
  const before = readFileSync(global, "utf8");
  const env = {
    ...process.env,
    CI: "",
    MISE_NO_HOOKS: "1",
    GIT_CONFIG_GLOBAL: global,
    GIT_CONFIG_NOSYSTEM: "1",
  };
  const run = (command, args) => spawnSync(command, args, { cwd: repo, env, encoding: "utf8" });
  try {
    for (const file of [
      "mise.toml",
      "mise.lock",
      "hk.pkl",
      "release-please-config.json",
      "backend/go.mod",
      "frontend/.nvmrc",
      "frontend/package.json",
      "scripts/check-commit-message.mjs",
      "mise-tasks/commit/check",
    ]) {
      mkdirSync(join(repo, file, ".."), { recursive: true });
      cpSync(file, join(repo, file));
    }
    assert.equal(run("git", ["init", "--template="]).status, 0);
    assert.equal(run("mise", ["trust", join(repo, "mise.toml")]).status, 0);
    let result = run("mise", ["run", "hooks:install"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readdirSync(join(repo, ".git/hooks")), ["commit-msg"]);
    assert.notEqual(run("git", ["commit", "--allow-empty", "-m", "invalid message"]).status, 0);
    result = run("git", ["commit", "--allow-empty", "-m", "feature(test)!: valid commit"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(global, "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
