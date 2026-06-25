# Getting Started

## Prerequisites

- Node.js 20+
- pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- Playwright browsers: `pnpm exec playwright install` (for scraper)
- MongoDB Atlas cluster with vector search index configured
- Google Gemini API key
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

## Setup

```bash
git clone <repo-url>
cd poupaia
pnpm install
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

```
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/
MONGODB_PRODUCTS_DB_NAME=products
GEMINI_API_KEY=your_gemini_api_key
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

Additional optional vars:

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGODB_VECTOR_INDEX_NAME` | `product_vector_search` | Atlas vector search index name |
| `MONGODB_VECTOR_DIMENSIONS` | (none) | Expected embedding dimensions |
| `MONGODB_VECTOR_FIELD_PATH` | `embedding` | Field path for vectors |
| `MONGODB_VECTOR_SIMILARITY` | `cosine` | Similarity metric |
| `NO_SCRAPING` | (none) | If `true`, skips scraping steps |
| `PORT` | `3000` | Express port |

## MongoDB Atlas vector search index

Create a vector search index on the `products` collection:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1578,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "currentPrice"
    },
    {
      "type": "filter",
      "path": "discountPercentage"
    },
    {
      "type": "filter",
      "path": "id"
    }
  ]
}
```

## Running

### API (bot)
```bash
cd apps/api
pnpm dev          # development with watch
pnpm start        # production
```

The bot listens on port 3000 (or `PORT` env var) and expects Telegram webhooks at `POST /`.

### Scraper
```bash
pnpm scraper           # from repo root
# or
cd apps/scraper && pnpm start
```

### Tasks
```bash
cd apps/tasks
pnpm clean-database    # stub, not yet implemented
pnpm check-alerts      # stub, not yet implemented
```

### Build all packages
```bash
pnpm build             # runs tsc in every package
```

### Format
```bash
pnpm format            # Prettier
pnpm format:check      # Prettier check-only
```
