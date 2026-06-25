# Scraping

## Overview

The scraper (`apps/scraper`) uses Playwright with stealth plugins to scrape Amazon.es promotions. It runs as a standalone Node.js process (not deployed to Cloud Run).

## Flow

### `apps/scraper/src/index.ts` — Sequential Listr tasks
1. **Random wait** (0–1 hour) — staggers instances if running in parallel
2. **Connect to MongoDB**
3. **Scrape Amazon** — `scrapAmazon()` with configurable parallel tasks (`PARALLEL_TASKS`, default 1)
4. **Save products** — bulk upsert into MongoDB, filtering by approved brands
5. **Delete expired products** — remove null-priced, expired, or stale (>2 days) products
6. **Notify users** — for each user with interests: find products from the last hour matching their categories, send unsent products via Telegram

### `apps/scraper/src/amazon.ts` — Amazon scraping

1. **Navigate** to `amazon.es/deals?language=pt_PT`
2. **Cookie dialog** — accept if present
3. **Expand filters** — click "Ver mais" for departments and brands
4. **Iterate departments**:
   - Click main department → load sub-departments
   - For each sub-department:
     - Listen for promotions API responses (`/api/marketplaces/.../promotions`)
     - Click brand filters matching the approved brand list (311 brands)
     - Auto-scroll to trigger lazy-loaded content
     - Uncheck brands and move to next sub-department
     - Navigate back to main department list
5. **Parse products** from API responses:
   - Extract ASIN, title, brand, prices, discount, image, expiration
   - Filter by discount tier (only "razoavel" or above)
   - Map to parent category via `getParentCategory()`
6. **Error recovery**: on category failure, reloads page and skips to next

## Discount tiers

Products are rated by discount depth, based on price range:

| Price range | Fraco | Razoavel | Bom | Excelente |
|-------------|-------|----------|-----|-----------|
| ≤10€ | <30% | ≥30% | ≥50% | ≥70% |
| ≤50€ | <5€ saved | ≥5€ | ≥10€ | ≥20€ |
| ≤200€ | <15€ saved | ≥15€ | ≥30€ | ≥60€ |
| ≤500€ | <40€ saved | ≥40€ | ≥80€ | ≥150€ |
| ≤1000€ | <80€ saved | ≥80€ | ≥150€ | ≥300€ |
| >1000€ | <80€ saved | ≥80€ | ≥150€ | ≥300€ |

Only products rated **razoavel** or above are saved.

## Anti-detection measures

Uses `playwright-extra` with the `puppeteer-extra-plugin-stealth`:
- Random user agent (one of 3 Chrome variants)
- pt-PT locale
- Anti-detection browser flags
- Human-like clicks with random delays (`clickLikeHuman()`)
- Random scroll increments (`autoScroll()`)
- Random timeouts between actions

## `NO_SCRAPING` flag

Set `NO_SCRAPING=true` to skip scraping steps (useful in environments without Playwright binaries, like production Cloud Run).

## Product lifecycle

1. **Scraped** → `createdAt` set, brand-filtered, discount-tier checked
2. **Saved** → bulk upsert into `products` collection (upsert by `id`)
3. **Expired** → deleted via `deleteInvalidProducts()` if expired or >2 days without expiration
4. **Notified** → sent to users matching category interests. Products track `sentToUserIds` to avoid duplicates.
