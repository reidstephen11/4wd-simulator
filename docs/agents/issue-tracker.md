# Issue tracker: GitHub

Specs and tickets for this repo are GitHub issues on `reidstephen11/4wd-simulator`.

The "What's next" list in `README.md` stays the list of ideas that nobody has started. When an idea is picked up, its spec and tickets become issues.

File issues only into this repo, never into `mattpocock/skills`.

## Which tool

In a Claude Code cloud session there is no `gh` CLI: use the GitHub MCP tools (`mcp__github__*`). On a computer with `gh` signed in, the `gh` commands in brackets do the same.

- **Create an issue**: `issue_write` with `method: "create"` (`gh issue create`).
- **Read an issue**: `issue_read` (`gh issue view <number> --json number,title,body,labels,comments`).
- **List issues**: `list_issues`, filtered by `labels` and `state` (`gh issue list`).
- **Make an issue a sub-issue of a parent**: pass `parent_issue_number` to `issue_write` when creating it, or `sub_issue_write` afterwards (`gh issue create --parent <parent>`).
- **Blocking**: the MCP tools cannot set GitHub's native issue dependencies, so put a `Blocked by: #<n>, #<n>` line at the top of the blocked issue's body. With `gh` 2.94 or later, also add the native edge (`gh issue edit <child> --add-blocked-by <blocker>`). A ticket is unblocked when every blocker is closed.
- **Comment on an issue**: `add_issue_comment` (`gh issue comment`).
- **Apply or remove labels**: `issue_write` with `method: "update"` and the full list of labels the issue should have (`gh issue edit --add-label` / `--remove-label`). A label that does not exist yet is created when it is first applied.
- **Close**: comment with the explanation first, then `issue_write` with `state: "closed"` (`gh issue close`).

## Pull requests as a triage surface

**PRs as a request surface: no.** The owner is the only contributor; pull requests here are the agent's own work.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / Not-yet-specified / Out-of-scope body.
- **Child ticket**: a sub-issue of the map. Labels: `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`). Once claimed, the ticket is assigned to the owner.
- **Blocking**: see **Blocking** above.
- **Frontier query**: list the map's open sub-issues, drop any with an open issue in its `Blocked by` line or with an assignee; the first in map order wins.
- **Claim**: assign the ticket to the owner, as the session's first write.
- **Resolve**: comment with the answer, close the issue, then add a line (gist and link) to the map's Decisions-so-far.
