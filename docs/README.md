# claude-village - docs index

Read order for anyone (human or agent) joining this project:

1. **[Design spec](design/2026-04-20-claude-village-design.md)** - what we are building and why. Source of truth for scope.
2. **[Implementation plan](plans/2026-04-20-claude-village-plan.md)** - the 17 tasks that build the app, with TDD steps and exact commands.
3. **[Progress tracker](progress.md)** - live status of every task. Check here before starting any task.

## Rules for agents

- Before implementing a task, read the matching section of the **plan** in full and the **design** sections the plan cites.
- Check **progress.md** to confirm the task is not already claimed or completed.
- Each task maps to one commit / PR. Keep commits scoped; do not bundle.
- Update **progress.md** when you start (claim with your agent id), finish (mark completed + commit sha), or hit a blocker (mark blocked + reason).
- No em dashes (`-` only), no arrows (`->` instead of `→`) in any committed file.
- TDD where the plan specifies: write the failing test, run it, implement, run again.
- After each task, run `pnpm lint && pnpm typecheck && pnpm test` before committing.
