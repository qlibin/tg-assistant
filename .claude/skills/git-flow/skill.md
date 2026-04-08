---
name: git-flow
description: Full git workflow for a GitHub issue — move to In Progress, branch, implement, validate, PR, close. Invoke with an issue number, e.g. `/git-flow 42`.
user-invocable: true
---

# Git Flow Skill

End-to-end workflow for shipping a GitHub issue: pick up the ticket, branch, implement, validate, open a PR, and close the issue.

**Usage:** `/git-flow <issue-number>`

## Constants (project-specific)

```
PROJECT_NUMBER : 3
PROJECT_ID     : PVT_kwHOACgNx84BSiDY
STATUS_FIELD_ID: PVTSSF_lAHOACgNx84BSiDYzhACbS4
IN_PROGRESS_ID : 47fc9ee4
DONE_ID        : 98236657
OWNER          : qlibin
```

## Tools

Always use `gh` CLI. Never use MCP GitHub tools. Never push directly to `main`.

---

## Step 1 — Read the Issue

```bash
gh issue view <issue-number> --repo qlibin/tg-assistant
```

Read the full issue body. Understand acceptance criteria before touching any code.

---

## Step 2 — Move Ticket to "In Progress"

Find the project item ID for the issue, then update its status.

```bash
# Get item ID
ITEM_ID=$(gh project item-list 3 --owner qlibin --format json \
  | jq -r --argjson n <issue-number> '.items[] | select(.content.number == $n) | .id')

# Move to In Progress
gh project item-edit \
  --project-id PVT_kwHOACgNx84BSiDY \
  --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOACgNx84BSiDYzhACbS4 \
  --single-select-option-id 47fc9ee4
```

---

## Step 3 — Create a Feature Branch

Branch name format: `<type>/issue-<number>-<short-slug>`

- Derive `<type>` from the issue: `feat` for new features, `fix` for bugs, `chore` for maintenance, `docs` for documentation-only.
- Derive `<short-slug>` from the issue title: lowercase, spaces → hyphens, max ~5 words.

```bash
git checkout main
git pull origin main
git checkout -b <type>/issue-<number>-<short-slug>
```

---

## Step 4 — Implement

- Consult `CLAUDE.md` for project conventions (TypeScript strict, ESM, naming, test coverage thresholds).
- Follow the AAA test pattern; keep coverage ≥ 85% statements/functions/lines, ≥ 75% branches.
- Never delete snapshot files — update with `npm test -- -u` if shapes change.
- Work incrementally; verify with `npm test` before final validation.

---

## Step 5 — Update Documentation (if needed)

Review whether any of the following need updating:
- `README.md` — if user-facing behaviour or setup changed
- `CLAUDE.md` — if conventions, commands, or architecture changed
- Inline JSDoc/comments — only where logic is non-obvious

Skip docs if nothing changed that would affect a developer picking up this repo fresh.

---

## Step 6 — Validate

```bash
npm run validate   # build + lint + format + type-check + test
```

Fix any errors before proceeding. Do not skip or suppress checks.

---

## Step 7 — Commit

Stage specific files (never `git add -A` blindly):

```bash
git add <specific files>
git commit -m "<type>(<scope>): <short description>

<optional body>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Follow conventional commits. Scope is the package name (e.g. `webhook`, `feedback`, `common`, `infra`).

---

## Step 8 — Open a PR

Push the branch and create a PR. The `Closes #N` line moves the issue to Done automatically when the PR is merged.

```bash
git push -u origin <branch-name>

gh pr create \
  --title "<type>(<scope>): <short description>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] `npm run validate` passes
- [ ] <any manual verification steps>

Closes #<issue-number>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base main \
  --head <branch-name>
```

Return the PR URL to the user.

---

## Step 9 — Done

GitHub auto-closes the issue and moves the project card to Done when the PR is merged (via `Closes #N`).

If you need to move the card manually (e.g. issue closed outside a PR):

```bash
ITEM_ID=$(gh project item-list 3 --owner qlibin --format json \
  | jq -r --argjson n <issue-number> '.items[] | select(.content.number == $n) | .id')

gh project item-edit \
  --project-id PVT_kwHOACgNx84BSiDY \
  --id "$ITEM_ID" \
  --field-id PVTSSF_lAHOACgNx84BSiDYzhACbS4 \
  --single-select-option-id 98236657
```

---

## Quick Reference

| Status    | Option ID  |
|-----------|------------|
| Todo      | f75ad846   |
| In Progress | 47fc9ee4 |
| Done      | 98236657   |
