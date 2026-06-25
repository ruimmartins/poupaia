# Bot Workflows

## Entry point: `apps/api`

The API is an Express 5 server with two endpoints:
- `POST /` — Telegram webhook: receives all messages and callback queries
- `GET /health` — health check

On startup, registers bot commands via `setMyCommands`: `/start` and `/interesses`.

## Message handling: `entry.ts`

`handleRequest()` processes incoming Telegram messages:

```
/start → send welcome message → transition to SETTING_INTERESTS → show categories
/interesses → transition to SETTING_INTERESTS → show categories
any other text → remind user to use /interesses
```

## User state machine

| State | Trigger | Behaviour |
|-------|---------|-----------|
| `IDLE` | First message (not a command) | AI classifies intent → search or ask interests |
| `SETTING_INTERESTS` | `/start`, `/interesses`, "save_interests" callback | Show category picker with inline keyboard |
| `BROWSING` | After receiving products | AI analyzes follow-up messages against current product list |

## IDLE workflow (`workflows/idle.ts`)

1. Sends a "loading" message to user
2. Fetches all distinct parent categories from MongoDB
3. Calls Gemini AI with the idle prompt, passing user messages as content
4. AI returns one of:
   - **SEARCH** — generates embedding of `"{query}, Category: {categories}"` → MongoDB vector search → sends products. Updates user state to `BROWSING`.
   - **SAVE_INTERESTS** — transitions to `SETTING_INTERESTS`, shows category picker.
   - **IRRELEVANT** — sends "not understood" message with action buttons (Pesquisar, Interesses, Prenda).

## BROWSING workflow (`workflows/browsing.ts`)

1. Reads the last activity (products the user has seen)
2. Calls Gemini AI with the browsing prompt and current product list
3. AI returns one of:
   - **MORE_INFO** — shows details for a specific product from the list
   - **MORE_PRODUCTS** — searches with the same intent filters, excluding already-seen products. Sends up to 5 more.
   - **IRRELEVANT** — sends "message not understood" fallback.

## Interests workflow (`workflows/interests.ts`)

### Category picker
- Displays categories in pages of 5 with inline keyboard
- Users toggle categories on/off by clicking
- Navigation: "Anterior" / "Próxima" page buttons
- "Guardar" saves selections and returns to `IDLE`
- "Cancelar" discards and returns to `IDLE`
- State is tracked per-user in memory (`Map<userId, CategoryState>`)

### Callback routing (`callback-handler.ts`)
- In `SETTING_INTERESTS` state → delegates to `handleCategoryCallback()`
- `save_interests` from `IDLE` state → transitions to `SETTING_INTERESTS` and shows category picker

## AI intent types

### IdleIntentTypeEnum
- `SEARCH` — user wants to find products. Returns `QueryFilters` with query, price range, categories.
- `GIFT` — user wants gift ideas (not yet implemented separately).
- `SAVE_INTERESTS` — user wants to set up interest categories.
- `IRRELEVANT` — message not understood or not product-related.

### BrowsingIntentTypeEnum
- `MORE_INFO` — user asks about a specific product they've seen. Returns product index and verdict.
- `MORE_PRODUCTS` — user wants more products from the same search.
- `IRRELEVANT` — message not related to current product list.

## Product sending flow

`sendProductsToUser()` (`packages/shared`):
1. Formats products into Telegram messages (price, discount, expiration)
2. Generates composite images (product photo + price overlay) via `@poupaia/image`
3. Falls back to URL-sourced images if generation fails
4. If NOT from scraper: sets user state to `BROWSING`, sends follow-up message with action buttons ("nova pesquisa", "ver mais")
5. If from scraper: sends all products without state change or follow-up

## Queries & embeddings

- User search queries are stored with their embeddings
- `mergeOrAppendQuery()` uses cosine similarity (threshold 0.92) to merge similar queries
- This allows the bot to refine searches over time based on user behaviour
