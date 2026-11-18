"""Behavior checks for the commands used by CI."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
GROUPS = ("lint", "checks", "test", "test-frontend")


class CIBehaviorTests(unittest.TestCase):
    def test_aggregate_requires_every_group_to_succeed(self):
        for group in GROUPS:
            for state in ("success", "failure", "cancelled", "skipped", None):
                with self.subTest(group=group, state=state):
                    results = {name: {"result": "success"} for name in GROUPS}
                    if state is None:
                        del results[group]
                    else:
                        results[group]["result"] = state
                    env = {**os.environ, "RESULTS": json.dumps(results)}
                    result = subprocess.run(
                        ["bash", str(ROOT / ".github/scripts/check-results.sh")],
                        env=env, capture_output=True, text=True, check=False,
                    )
                    self.assertEqual(result.returncode == 0, state == "success", result.stderr)

    def test_mise_propagates_failure_from_each_kind_of_check(self):
        cases = (
            ("backend:test-ci", "go", "vet"),
            ("backend:test-ci", "go", "test"),
            ("backend:test-ci", "go", "build"),
            ("backend:lint", "golangci-lint", "config"),
            ("backend:sqlc-check", "sqlc", "generate"),
        )
        for task, tool, failing_step in cases:
            with self.subTest(task=task, failing_step=failing_step):
                with tempfile.TemporaryDirectory() as temp:
                    command = Path(temp) / tool
                    marker = Path(temp) / "called"
                    command.write_text(
                        '#!/bin/sh\n'
                        'if [ "$1" = "$FAIL_STEP" ]; then touch "$MARKER"; exit 17; fi\n'
                        'exit 0\n'
                    )
                    command.chmod(0o755)
                    env = {
                        **os.environ, "PATH": temp + os.pathsep + os.environ["PATH"],
                        "MARKER": str(marker), "FAIL_STEP": failing_step,
                        "MISE_NO_HOOKS": "1", "MISE_DISABLE_TOOLS": tool,
                    }
                    result = subprocess.run(
                        ["mise", "run", task], cwd=ROOT, env=env,
                        capture_output=True, text=True, check=False,
                    )
                    self.assertTrue(marker.exists(), result.stderr)
                    self.assertNotEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
