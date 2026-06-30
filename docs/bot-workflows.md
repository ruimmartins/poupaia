# Bot Workflows

## Entry point: `apps/api`

The API is an Express 5 server with two endpoints:
- `POST /` — Telegram webhook: receives all messages and callback queries
- `GET /health` — health check

On startup, registers bot commands via `setMyCommands`: `/start`, `/interesses`, `/preferencias`.

## Message handling: `entry.ts`

`handleRequest()` processes incoming Telegram messages:

```
/start → send welcome message → transition to SETTING_INTERESTS → show interests prompt
/interesses → transition to SETTING_INTERESTS → show interests prompt
/preferencias → transition to SETTING_NOTIF_PREFS → show notification preferences
text in SETTING_INTERESTS state → AI interest extraction → show confirmation
any other text → remind user of available menu commands
```

## User state machine

| State | Trigger | Behaviour |
|-------|---------|-----------|
| `IDLE` | Default after commands | Waits for menu commands. Free text shows menu reminder. |
| `SETTING_INTERESTS` | `/start`, `/interesses` | Natural language interest extraction via DeepSeek → confirmation → Gemini embeddings → save |
| `SETTING_NOTIF_PREFS` | `/preferencias` | Notification preferences (discount level, results per category) |
| `BROWSING` | After receiving products | AI analyzes follow-up messages against current product list |

## Interests workflow (`workflows/interests-ai.ts`)

### Natural language interest setting

Users express their shopping interests in free-form Portuguese text. The flow:

1. **Prompt**: Bot sends "Em que estás interessado?" (shows existing interests if any)
2. **Extraction**: User writes e.g. `"quero sapatilhas Nike, calças Levi's e café em grão"`
3. **DeepSeek API** (`deepseek-chat` V3) extracts structured operations:
   - **add** — new interests to track
   - **update** — modify existing interests (add exclusions, brands)
   - **remove** — delete an interest
4. **Confirmation**: Bot shows extracted interests with inline keyboard `[✅ Confirmar] [❌ Cancelar]`
5. **Gemini Embedding**: On confirm, Gemini generates 384-dim embeddings for each interest query, saves to MongoDB

### Interest data model (`InterestItem`)

```typescript
interface InterestItem {
  query: string;              // "café em grão"
  categories: string[];       // parent categories: ["Animais & Mercearia"]
  brands?: string[];          // ["Delta"]
  includeKeywords?: string[]; // words MUST be in title: ["grão"]
  excludeKeywords?: string[]; // words must NOT be in title: ["cápsulas"]
  excludeBrands?: string[];   // brands to exclude: ["Lavazza"]
  embedding?: number[];       // Gemini embedding vector (384-dim)
  createdAt: string;
}
```

### Interaction examples

| User writes | DeepSeek extracts |
|-------------|-------------------|
| `"quero calças, telemóveis e café em grão"` | 3 × `add` (calças, telemóveis, café em grão) |
| `"não quero café em grão da Lavazza"` | 1 × `update` (café em grão — excludeBrands: Lavazza) |
| `"não quero brinquedos de menina"` | 1 × `update` (brinquedos — excludeKeywords) |
| `"tira os telemóveis"` | 1 × `remove` (telemóveis) |
| `"quero sapatilhas Nike e sem calças"` | 1 × `add` + 1 × `remove` |

### Callback routing (`callback-handler.ts`)
- In `SETTING_INTERESTS` state → delegates to `handleInterestsAICallback()`
- `save_interests` from `IDLE` state → transitions to `SETTING_INTERESTS` and shows interests prompt

## Notification preferences workflow (`workflows/notif-prefs.ts`)

Users configure:
- `minDiscountLevel`: `razoavel`, `bom`, or `excelente`
- `maxResultsPerCategory`: 10, 20, 50, or unlimited (0)

## Scraper → notification pipeline

1. Playwright scrapes Amazon.es/deals
2. Products saved to MongoDB (upsert), filtered by ~311 approved brands
3. **New**: `generateProductEmbeddings()` creates Gemini embeddings for products missing them
4. For each user with interests:
   - **New**: `searchProductsByInterests()` runs `$vectorSearch` per interest, with post-filters for category, brand, includeKeywords, excludeKeywords, excludeBrands
   - Falls back to plain category matching for legacy interests without embeddings
   - Respects `notificationPrefs` (discount level, per-category limits)
   - Skips products already sent (`sentToUserIds`)
5. Products sent via Telegram with composite images

## Product sending flow

`sendProductsToUser()` (`packages/shared`):
1. Formats products into Telegram messages (price, discount, expiration)
2. Generates composite images (product photo + price overlay) via `@poupaia/image`
3. Falls back to URL-sourced images if generation fails
4. If NOT from scraper: sets user state to `BROWSING`, sends follow-up message with action buttons
5. If from scraper: sends all products without state change or follow-up

## AI services

| Service | Model | Purpose |
|---------|-------|---------|
| **DeepSeek** | `deepseek-chat` (V3) | Interest extraction from natural language |
| **Gemini** | `gemini-2.5-flash-lite` | Intent classification (search/gift/interests) |
| **Gemini** | `gemini-embedding-001` | 384-dim embeddings (product titles + interest queries) |

## Environment variables

```
GEMINI_API_KEY=...       # Google Gemini (embeddings + search intent)
DEEPSEEK_API_KEY=...      # DeepSeek (interest extraction)
```

## Queries & embeddings

- User search queries are stored with embeddings
- `mergeOrAppendQuery()` uses cosine similarity (threshold 0.92) to merge similar queries
- Product embeddings generated by scraper after each scrape run
- Interest embeddings generated when user confirms interests
