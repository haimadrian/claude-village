# Development

## Prerequisites

- Node 20 (project pins via `.nvmrc` if present; install via `nvm` or Homebrew).
- `pnpm` 9 or 10.
- macOS for full dev (Electron targets macOS; `pnpm package` builds a `.dmg`).
- No native build tools needed; we deliberately avoid native modules.

## Get the code

```bash
git clone git@github.com:haimadrian/claude-village.git
cd claude-village
pnpm install --frozen-lockfile
```

## Common commands

| Command          | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `pnpm dev`       | electron-vite dev with HMR on the renderer.                                               |
| `pnpm build`     | Emits `main`, `preload`, and `renderer` into `out/`. Required before `pnpm e2e`.          |
| `pnpm package`   | `electron-vite build` then `electron-builder --mac`; outputs `.dmg` into `release/`.      |
| `pnpm test`      | Vitest unit tests.                                                                         |
| `pnpm e2e`       | Playwright over Electron. Runs against `out/`; does NOT build first.                      |
| `pnpm e2e:full`  | Builds then runs Playwright. Use this if you are unsure whether `out/` is fresh.          |
| `pnpm lint`      | ESLint (flat config) + Prettier check.                                                     |
| `pnpm lint:fix`  | ESLint with `--fix` and Prettier `--write`.                                                |
| `pnpm typecheck` | `tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit`.                |

## Before committing

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

If you touched anything e2e-facing, also:

```bash
pnpm e2e:full
```

## Project layout

```
src/
  shared/        # types + zone vocabulary (both processes)
  main/          # Node process (watcher, hook server, classifier, store, ipc-bridge, logger, normalizer, hook-installer)
  preload/       # contextBridge (emitted as index.cjs)
  renderer/      # React app
    main.tsx, App.tsx
    context/SessionContext.tsx
    village/     # scene root + Zone, Character, Boat, FishSchool, Seabed, etc.
    settings/    # SettingsScreen, AboutModal, HelpModal, sessionFilter
    logger.ts
tests/
  unit/          # Vitest
  e2e/           # Playwright over Electron
scripts/
  build-pages.mjs                 # renders docs + reports into _pages/ for GitHub Pages
  ci-coverage-summary.mjs         # emits the coverage table in the Action step summary
  generate-placeholder-glbs.mjs   # regenerates the bundled placeholder character / zone GLBs
.github/workflows/
  ci.yml, e2e.yml, pages.yml, release.yml
.idea/runConfigurations/          # shared WebStorm launchers
docs/
  README.md, install.md, usage.md, development.md, progress.md
  design/ plans/ wiki/
```

## Invariants

These come from `AGENTS.md` and bite anyone who violates them:

- No em dashes (`-` only), no arrows in prose (`->` not the unicode arrow).
- Conventional commit messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `ci:`, `style:`. No scope parenthetical, no team prefix.
- Never `--no-verify`, never `--force`. Fix the underlying issue instead.
- Keep commits scoped; one logical change per commit.
- Update `docs/progress.md` when finishing a meaningful pass.

## Testing tips

- For a single unit test file: `pnpm test -- tests/unit/foo.test.ts`.
- For a single e2e file: `pnpm exec playwright test tests/e2e/tooltip.spec.ts` (still wants `pnpm build` first, or use the scripts/tooling in `package.json`).
- The e2e multi-agent / tooltip specs allocate an ephemeral free port per `beforeAll` so re-runs do not hit `EADDRINUSE` on port 49251. If you add a new e2e that launches Electron, use the same `pickFreePort()` pattern.

## Releasing

Push a tag `vX.Y.Z` or manually dispatch the `Release (.dmg)` workflow under Actions. The workflow builds, packages, and publishes the `.dmg` as a GitHub Release asset. Main-branch pushes automatically rebuild GitHub Pages.

## Troubleshooting your dev env

See [[Troubleshooting]].
