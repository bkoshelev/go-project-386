import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const policy = JSON.parse(readFileSync(new URL("../release-please-config.json", import.meta.url)));
const types = policy.packages["."]["changelog-sections"].map(({ type }) => type).join(",");
const args = process.argv.slice(2);
let temporary;
try {
  let file;
  if (args.length === 2 && args[0] === "--pr-event") {
    const title = JSON.parse(readFileSync(args[1], "utf8")).pull_request?.title;
    // hk deliberately exempts Git-generated titles. PR titles must be Conventional Commits.
    if (typeof title !== "string" || !/^[a-z]+(?:\([^\r\n)]+\))?!?: \S[^\r\n]*$/u.test(title)) {
      throw new Error("PR title must be a single Conventional Commit header");
    }
    temporary = mkdtempSync(join(tmpdir(), "pr-title-"));
    file = join(temporary, "message");
    writeFileSync(file, title);
  } else if (args.length === 1) {
    [file] = args;
  } else {
    throw new Error("Usage: mise run commit:check -- <message-file> | --pr-event <event-file>");
  }
  const result = spawnSync(
    "hk",
    ["util", "check-conventional-commit", "--allowed-types", types, file],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
