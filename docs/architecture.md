# Architecture

## Overview

Poupaia is a Telegram bot that finds and alerts users about Amazon.es promotions. It has three main concerns:

1. **Scraping** — Playwright scrapes Amazon.es promotions, storing them in MongoDB.
2. **Bot** — Express webhook receives Telegram messages, uses Gemini AI to understand user intent, searches products via MongoDB vector search, and sends results with images.
3. **Notifications** — After scraping, products matching user interests are pushed to Telegram.

## Monorepo structure

```
apps/
  api/          @poupaia/api        Express 5 + Telegram bot webhook
  scraper/      @poupaia/scraper-app  Standalone scraper runner
  tasks/        @poupaia/tasks      Scheduled tasks (clean-database, check-alerts) — stub

packages/
  db/           @poupaia/db         MongoDB client, models, CRUD
  ai/           @poupaia/ai         Google Gemini AI (intents + embeddings)
  messaging/    @poupaia/messaging  Telegram API helpers, message templates
  scraper/      @poupaia/scraper    Playwright browser utils (used by apps/scraper)
  shared/       @poupaia/shared     Orchestration (send products, vector utils)
  image/        @poupaia/image      Product image generation (sharp)
```

## Data flow

### User search flow
```
Telegram message → Express webhook (apps/api)
  → entry.ts: routes /start, /interesses, or delegates to workflows
  → idle.ts: AI classifies intent (search/gift/save_interests/irrelevant)
  → If SEARCH: generates embedding → MongoDB vectorSearch → products found
  → sendProductsToUser: formats + generates images → sends to Telegram
  → User state set to BROWSING
```

### Browsing flow (user already received products)
```
Telegram message → Express webhook
  → browsing.ts: AI analyzes message against current product list
  → MORE_INFO: returns specific product details
  → MORE_PRODUCTS: fetches next batch from MongoDB
```

### Scraper → notification flow
```
apps/scraper → Playwright scrapes amazon.es/deals
  → Filters brand, discount tier → saves to MongoDB
  → For each user with interests: queries products from last hour
  → Sends new (unsent) products to user via Telegram
```

## Technology stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 |
| Language | TypeScript 5.9 (CommonJS) |
| Package manager | pnpm 10 (monorepo) |
| Web framework | Express 5 |
| Database | MongoDB Atlas (with vector search) |
| AI | Google Gemini 2.5 Flash Lite + Gemini Embedding |
| Scraping | Playwright + playwright-extra stealth |
| Images | Sharp |
| Deployment | Docker → Google Cloud Run |
| CI/CD | GitHub Actions |
