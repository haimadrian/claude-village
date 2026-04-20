# claude-village - AGENTS.md

You are working on **claude-village**: a Mac Electron app that visualizes running Claude Code sessions as a Minecraft-style voxel village. Tabs per session, voxel characters per agent, 9 activity-mapped zones, A* pathfinding, tooltips, timeline strip, conversation animations.

## Before you do anything

Read these three files in this order:

1. `docs/design/2026-04-20-claude-village-design.md` - the spec. What we are building and why.
2. `docs/plans/2026-04-20-claude-village-plan.md` - the 17-task TDD-style implementation plan with exact code, paths, and commands.
3. `docs/progress.md` - current status of every task. Check before claiming one.

## Rules

- Pick a task only if its status is `[ ]` (pending) AND all its dependencies are `[x]` (complete).
- Claim the task by editing `docs/progress.md` (set status to `[~]`, add your agent id and timestamp). Commit that change before starting implementation.
- Follow the plan's steps for your task exactly. If a step says "write failing test", write the test first and run it to confirm it fails before implementing.
- One commit per task by default. Small extra commits for distinct fixes are fine.
- Commit message format: `feat(scope): ...` / `fix: ...` / `test: ...` / `chore: ...` / `docs: ...`.
- Never skip pre-commit hooks (no `--no-verify`).
- Before every commit run: `pnpm lint && pnpm typecheck && pnpm test` (and `pnpm e2e` if relevant).
- Style: no em dashes in any file (use `-`), no arrows (use `->`).
- When you finish, update `docs/progress.md` to `[x]` with the commit sha. Commit that update in the same PR.

## Working style (from the repo owner)

- Direct communication, no fluff.
- Verify before asserting. If a method signature differs from the plan, read the actual file.
- Do not add scope not in the plan.
- Defer UI polish unless the plan asks for it.

## Stack quick reference

- Electron 33 (main + preload + renderer).
- Renderer: React 18, Vite, `@react-three/fiber`, `@react-three/drei`, Three.js 0.169.
- Main: Node 20, `chokidar`, `better-sqlite3`, `pathfinding`.
- Tests: Vitest (unit), Playwright (e2e).
- Package manager: pnpm 9.

## Absolute paths you need

- Repo root: `~/Documents/GIT/claude-village`
- Claude sessions watched: `~/.claude/projects/**/*.jsonl` (overridable via `CLAUDE_CONFIG_DIR`)
- Hook server listens: `127.0.0.1:49251` (also `/tmp/claude-village.sock`)
- SQLite snapshot: `{app userData}/village.db`
