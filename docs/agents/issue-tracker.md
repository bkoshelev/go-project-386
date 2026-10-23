# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues in `bkoshelev/go-project-386`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <path>`. Write the exact body to a temporary file, preserving newlines and literal text.
- **Find issues**: use compact [discovery](#discovery) metadata before selecting a ticket.
- **Read an issue**: read the selected ticket's full body and discussion as described in [Reading selected issues](#reading-selected-issues).
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body-file <path>`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Run commands inside this clone; `gh` infers the repo from its GitHub remote. Outside the clone, pass `--repo bkoshelev/go-project-386` to commands that accept it. For API paths, `<owner>/<repo>` is `bkoshelev/go-project-386`.

## Discovery

List metadata with appropriate `--label` and `--state` filters. Do not request every
issue's body and comments just to choose a ticket:

```sh
gh issue list --state open --json number,title,state,labels,updatedAt
gh issue view 55 --json number,title,state,labels,author,createdAt,updatedAt
```

`gh issue list` is limited by default; choose `--limit` for the discovery scope.
If a workflow requires an exhaustive list, retrieve every page through the relevant
API endpoint and account for its filters (the REST issues endpoint also returns PRs).
Discovery metadata does not replace reading the selected issue.

## Reading selected issues

For a small ticket, fetch the body separately with `gh issue view <number> --json body --jq .body`.
Read all comments too, retaining their IDs, authors, creation and update dates:

```sh
gh api --paginate repos/bkoshelev/go-project-386/issues/55/comments \
  --jq '.[] | {id, author: .user.login, created_at, updated_at, body}'
```

For a large ticket or discussion, save the original responses without printing them
all. For example, from this clone, using a temporary directory:

```sh
issue_context_dir=$(mktemp -d /tmp/go-project-386-issue-55.XXXXXX)
printf '%s\n' "$issue_context_dir"
gh issue view 55 --json number,title,state,labels,author,createdAt,updatedAt,body \
  > "$issue_context_dir/issue.json"
gh api --paginate --slurp repos/bkoshelev/go-project-386/issues/55/comments \
  > "$issue_context_dir/comments.json"
```

Check each command's exit status before using its file. Keep GitHub error messages
visible; do not silence stderr or treat a failed request as an empty discussion.
Report the artifact paths. Extract the body's headings and complete sections from
`issue.json`, and read comments from `comments.json` in manageable portions. The
`--slurp` file is an array of page arrays: inspect page lengths and read every comment
with its `id`, `user.login`, `created_at`, `updated_at` and full `body`. A single REST
response is only one page; `--paginate` must complete successfully. Check the total
against the issue's reported comment count (`gh api repos/bkoshelev/go-project-386/issues/55 --jq .comments`);
if it differs or the issue changes during reading, reconcile the responses before
claiming completeness. A ticket with no comments still requires a successful check.

Use the general [context-reading procedure](context-reading.md) for section boundaries,
truncation recovery and recording coverage. When triage or another authorized skill
requires a full source, read the entire body and all discussion pages in portions;
selected fields and excerpts alone do not satisfy that requirement. Print extracted
content once, without repeating large service JSON envelopes. These local reading
conventions do not require changes to external skill libraries.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the selected ticket's full body and discussion using [Reading selected issues](#reading-selected-issues).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body-file <answer-file>`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
