# Deployment

## Dockerfiles

### `apps/api/Dockerfile` — Deployed to Cloud Run
- Base: `node:20-slim`
- Copies entire monorepo, installs with pnpm
- Runs `tsx` directly (no pre-build) — TypeScript transpiled on-the-fly
- Exposes port 8080
- `CMD ["pnpm", "start"]`

### `apps/scraper/Dockerfile`
- Base: `mcr.microsoft.com/playwright:v1.50.0-jammy` (includes Chromium binaries)
- Installs Chromium with deps during build
- Not deployed — runs standalone

### `apps/tasks/Dockerfile`
- Base: `node:20-slim`
- Minimal install
- Not deployed — runs standalone

## CI/CD (GitHub Actions)

File: `.github/workflows/deploy-gcp.yml`

Trigger: push to `master` + manual `workflow_dispatch`

Steps:
1. **Checkout** repository
2. **Google Auth** via Workload Identity Federation
3. **Docker Auth** to GCP Artifact Registry
4. **Build & Push** `apps/api/Dockerfile` with GHA cache
5. **Deploy to Cloud Run** (`poupaia-bot`, `europe-west1`)

Secrets injected at deploy:
- `TELEGRAM_BOT_TOKEN`
- `GEMINI_API_KEY`
- `MONGODB_URI`
- `MONGODB_PRODUCTS_DB_NAME`

## Required GitHub secrets

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Google Cloud project ID |
| `GCP_WIF_PROVIDER` | Workload Identity Federation provider |
| `GCP_SERVICE_ACCOUNT` | Service account email |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `GEMINI_API_KEY` | Google Gemini API key |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_PRODUCTS_DB_NAME` | MongoDB database name |

## Cloud Run configuration

- Service name: `poupaia-bot`
- Region: `europe-west1`
- Image stored in Artifact Registry: `europe-west1-docker.pkg.dev/{PROJECT_ID}/poupaia-repo/api:{sha}`
- Only `apps/api` is deployed. Scraper and tasks run outside CI/CD.
