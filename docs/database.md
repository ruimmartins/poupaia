# Database

## Connection

MongoDB connection via a singleton pattern (`packages/db/src/connection.ts`):
- `connectToDatabase()` returns the `Db` instance (creates on first call).
- `closeConnection()` closes the client.

Database name is set via `MONGODB_PRODUCTS_DB_NAME` env var.

## Collections & Models

### `products`
**Scraped Amazon products. Primary collection.**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique ID, e.g. `AMAZON_B0XXXXX` |
| `title` | `string` | Product title |
| `currentPrice` | `number` | Current sale price (EUR) |
| `originalPrice` | `number \| null` | Original list price |
| `brand` | `string \| null` | Brand name |
| `discountPercentage` | `number` | Calculated discount % |
| `url` | `string` | Amazon.es product URL |
| `imageUrl` | `string` | Product image URL |
| `category` | `string` | Full category path (e.g. "Eletrónica > Auriculares") |
| `parentCategory` | `string \| null` | Top-level category (e.g. "Eletrónica & Tecnologia") |
| `createdAt` | `string` | ISO timestamp when first seen |
| `updatedAt` | `string` | ISO timestamp of last update |
| `expiresAt` | `string \| null` | Deal expiration (ISO timestamp) |
| `sentToUserIds` | `number[]` | User IDs who received this product (from scraper) |
| `embedding` | `number[]` | Gemini embedding vector (1578 dimensions) |

Operations:
- `createOrUpdateProducts(db, products)` — bulk upsert, filters by approved brands, preserves `createdAt` on insert
- `deleteInvalidProducts(db)` — removes products with null price, expired deals, or >2 days old without expiration
- `searchProducts(db, filters, excludeIds?)` — MongoDB Atlas `$vectorSearch` with filter support (price range, discount, excluding IDs). Returns top 20 results sorted by vector similarity.
- `getBestPromotions(db, limit, excludeIds?)` — products from last hour sorted by discount descending
- `getAllProductsWithoutEmbeddings(db)` — finds products missing or with wrong-dimension embeddings
- `getAllCategories(db)` — distinct category strings

### `users`
**Telegram bot users.**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Telegram user ID (primary key) |
| `chatId` | `number` | Telegram chat ID |
| `state` | `UserStateEnum` | `idle`, `browsing`, `setting_interests` |
| `profile` | `Profile` | `{ firstName?, lastName?, username?, language? }` |
| `queries` | `UserQueries[]` | Search history with embeddings: `[{ query, embeddings? }]` |
| `interests` | `string[]` | Selected parent categories |
| `createdAt` | `string` | ISO timestamp |

Operations: `getOrCreateUser()`, `getAllUsers()`, `updateUserState()`

### `activities`
**User search sessions.**

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `number` | User ID |
| `startedAt` | `string` | ISO timestamp |
| `productsSent` | `Product[]` | Products sent in this session |
| `trigger` | `string` | Original user message |
| `intent` | `QueryFilters` | Search intent used |

Operations: `getLastActivity()`, `createOrUpdateActivity()`

### `messages`
**Conversation history for AI context.**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string \| null` | Message ID |
| `type` | `'user' \| 'model'` | Message source |
| `userId` | `number` | User ID |
| `text` | `string` | Message content |
| `timestamp` | `Date` | When message was sent |
| `processed` | `boolean` | Whether AI has processed it |

Operations: `saveMessage()`, `setMessegesAsProcessed()`, `getUnprocessedMessagesForUser()`

## QueryFilters type

Used by both search and scraping notification flows:

```typescript
interface QueryFilters {
  query: string[];          // Search query strings
  minPrice?: number;
  maxPrice?: number;
  minDiscount?: number;
  categories: string[];     // Parent categories to filter by
  minCreatedAt?: string;    // ISO timestamp (applied post-vector-search)
  maxCreatedAt?: string;
  embeddings?: number[];    // Vector for similarity search
}
```

## Categories

Static mapping in `packages/db/src/helpers/files/categories.ts`:
- 10 parent categories with mapped subcategories
- `getParentCategory(amazonCategory)` — reverse lookup from Amazon department to parent

## Brands whitelist

`packages/db/src/helpers/files/good-brands.ts` — 311 approved brands. Products with unknown brands are filtered out during `createOrUpdateProducts()`.

## Helper scripts

Located in `packages/db/src/helpers/`:
- `create-indexes.ts` — creates all required MongoDB indexes
- `export-data.ts` — exports brand/category data
