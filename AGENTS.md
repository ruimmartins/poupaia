# AGENTS.md

## What this is

Telegram price-alert bot + Amazon scraper + REST API. TypeScript monorepo (pnpm), backend only. Deploys to Google Cloud Run on push to `master`.

See `docs/` for detailed documentation on each topic:
- `docs/architecture.md` — System design + data flow
- `docs/getting-started.md` — Setup & first run
- `docs/packages.md` — Package reference
- `docs/database.md` — MongoDB models & operations
- `docs/bot-workflows.md` — Bot states & AI flow
- `docs/scraping.md` — How scraping works
- `docs/deployment.md` — CI/CD & Docker

## Key commands

| Task | Command | Where |
|------|---------|-------|
| API dev | `pnpm dev` | `apps/api` |
| Scraper | `pnpm scraper` | root |
| Build all | `pnpm build` | root |
| Format | `pnpm format` / `pnpm format:check` | root |

## Critical gotchas

- **Packages export raw `.ts` source** — `"main"` and `"types"` point to `src/index.ts`. No compilation needed locally.
- **No tests. No ESLint.** Typecheck via `pnpm build` or per-package `tsc`.
- **Prettier `printWidth: 300`** — no line wrapping.
- **Production Docker image does NOT pre-build** — runs `tsx` on-the-fly.
- **`.env` required at repo root** — all packages load dotenv. See `docs/getting-started.md`.
- **Website blocked**: Scraper requires Playwright browser binaries — run `playwright install`.
- **Only `apps/api` deploys to Cloud Run.**
