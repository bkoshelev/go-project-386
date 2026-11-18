import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../check.sh', import.meta.url));

function runCheck(failingTask = '', changed = false) {
  const root = mkdtempSync(join(tmpdir(), 'check-test-'));
  try {
    const bin = join(root, 'bin');
    const repo = join(root, 'repo');
    const api = join(repo, 'backend/internal/api');
    mkdirSync(bin, { recursive: true });
    mkdirSync(api, { recursive: true });
    for (const file of ['models.gen.go', 'server.gen.go']) writeFileSync(join(api, file), 'original\n');
    assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
    assert.equal(spawnSync('git', ['-C', repo, 'add', 'backend']).status, 0);
    if (changed) writeFileSync(join(api, 'models.gen.go'), 'changed\n');
    const log = join(root, 'tasks');
    writeFileSync(join(bin, 'mise'), '#!/bin/bash\nprintf "%s\\n" "$2" >> "$TASK_LOG"\n[[ "$2" != "$FAIL_TASK" ]]\n', { mode: 0o755 });
    const result = spawnSync('bash', [script], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, MISE_PROJECT_ROOT: repo, TASK_LOG: log, FAIL_TASK: failingTask },
    });
    return { status: result.status, output: result.stdout + result.stderr, tasks: readFileSync(log, 'utf8').trim().split('\n') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}


test('check runs each generator once and succeeds when all branches pass', () => {
  const { status, tasks } = runCheck();
  assert.equal(status, 0);
  for (const task of ['api:build', 'backend:api-generate-code', 'api:generate-client', 'backend:check', 'container:test', 'frontend:check-generated', 'frontend:build-generated', 'frontend:test', 'workflow:test']) {
    assert.equal(tasks.filter((item) => item === task).length, 1, task);
  }
});

test('independent failure does not cancel other checks', () => {
  const { status, tasks } = runCheck('workflow:test');
  assert.equal(status, 1);
  assert.ok(tasks.includes('backend:check'));
  assert.ok(tasks.includes('frontend:test'));
  assert.ok(tasks.includes('container:test'));
});

test('failed generators skip dependent checks', () => {
  for (const [failure, skipped] of [
    ['api:build', ['backend:api-generate-code', 'api:generate-client', 'container:test']],
    ['backend:api-generate-code', ['backend:check', 'container:test']],
    ['api:generate-client', ['frontend:check-generated', 'frontend:build-generated', 'frontend:test']],
  ]) {
    const { status, tasks, output } = runCheck(failure);
    assert.equal(status, 1, failure);
    for (const task of skipped) assert.ok(!tasks.includes(task), task);
    assert.match(output, /skipped/);
    assert.ok(tasks.includes('workflow:test'));
  }
});

test('Go diff fails the check without suppressing backend or container checks', () => {
  const { status, tasks } = runCheck('', true);
  assert.equal(status, 1);
  assert.ok(tasks.includes('backend:check'));
  assert.ok(tasks.includes('container:test'));
});
