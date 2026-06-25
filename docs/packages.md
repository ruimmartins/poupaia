# Packages Reference

## `@poupaia/db`
**MongoDB client, models, and CRUD operations.**

Models: `Product`, `User`, `Activity`, `Message`
Collections: `products`, `users`, `activities`, `messages`

Key exports:
- `connectToDatabase()` / `closeConnection()` — MongoDB connection singleton
- `getOrCreateUser()`, `getAllUsers()`, `updateUserState()` — user operations
- `createOrUpdateProducts()`, `deleteInvalidProducts()`, `searchProducts()`, `getBestPromotions()` — product operations
- `getAllCategories()` — distinct categories from products collection
- `saveMessage()`, `setMessegesAsProcessed()`, `getUnprocessedMessagesForUser()` — message history
- `getLastActivity()`, `createOrUpdateActivity()` — user activity tracking
- `getTopLevelCategories()`, `saveUserInterests()`, `getUserInterests()` — user interests
- `brands` — static list of 311 approved brands (filters out unknown products)
- `getParentCategory()` — maps Amazon categories to top-level parent categories
- `UserStateEnum` — `IDLE`, `BROWSING`, `SETTING_INTERESTS`

Vector search: `searchProducts()` uses MongoDB Atlas `$vectorSearch` aggregation with cosine similarity. Requires the `embedding` field on products and a configured vector search index.

## `@poupaia/ai`
**Google Gemini AI integration.**

Key exports:
- `processUserMessage<T>(systemInstruction, contents)` — calls Gemini 2.5 Flash Lite, extracts JSON from response. Template parameter `T` determines the expected response shape.
- `generateEmbedding(contents)` — calls Gemini Embedding (`gemini-embedding-001`), returns 1578-dimensional vectors.
- `idlePrompt(categories)`, `browsingPrompt(products)`, `interestsPrompt()` — prompt templates for each bot state.
- `relatedMessagesPrompt` — assesses whether a new message relates to the current conversation.
- `IdleIntentTypeEnum` — `SEARCH`, `GIFT`, `SAVE_INTERESTS`, `IRRELEVANT`
- `BrowsingIntentTypeEnum` — `MORE_INFO`, `MORE_PRODUCTS`, `IRRELEVANT`
- `InterestsIntentTypeEnum` — `SAVE_INTERESTS`, `REMOVE_INTERESTS`, `IRRELEVANT`

Response types: `SearchResponse`, `BrowsingResponse`, `InterestsResponse` — each includes a `type` field matching the intent enum plus structured intent data.

## `@poupaia/messaging`
**Telegram Bot API wrapper and message formatting.**

Key exports:
- `setMyCommands(commands)` — registers bot menu commands
- `sendTelegramMessage(chatId, text, actions?)` — sends text message with optional inline keyboard
- `editTelegramMessage(chatId, messageId, text, actions?)` — edits existing message
- `sendTelegramPhoto(chatId, photoUrl, caption)` — sends photo by URL
- `sendTelegramPhotoBuffer(chatId, buffer, caption)` — sends photo as buffer
- `escapeMarkdownV2(text)` — escapes Telegram MarkdownV2 special characters
- `formatProductsForUser(products)` — formats `Product[]` into `TelegramMessage[]` with price, discount, and expiration
- `formatMoreInfoMessage(product, intent)` — formats more-info responses
- `MESSAGES` / `QUESTIONS` / `getRandomMessage()` — message templates with randomization
- `BotCommand`, `TelegramMessage`, `TelegramAction`, `TelegramOptions` — type definitions

## `@poupaia/scraper`
**Playwright browser utilities. Used by `apps/scraper`.**

Key exports:
- `getBrowser()` — launches Chromium with `playwright-extra` + stealth plugin, pt-PT locale, random user agent, anti-detection flags
- `clickLikeHuman(element)` — click with random delay
- `autoScroll(page, times, intervalMs)` — scrolls with random increments
- `randomTimeout(value)` — random multiplier (0.5x–1.5x)
- `getRandomUserAgent()` — picks from 3 Chrome user agents
- `WAIT_FOR_CLICK_TIMEOUT`, `WAIT_FOR_SELECTOR_TIMEOUT`, `WAIT_FOR_NAVIGATION_TIMEOUT`, `WAIT_FOR_NETWORK_IDLE_TIMEOUT`, `GLOBAL_TIMEOUT` — timing constants

## `@poupaia/shared`
**Orchestration and utilities shared between apps.**

Key exports:
- `sendProductsToUser(db, userId, chatId, products, fromScraper?)` — sends products to Telegram user via `@poupaia/messaging` and `@poupaia/image`. Updates user state to `BROWSING` (if not from scraper). Limits to 10 products for searches, all for scraper notifications.
- `mergeOrAppendQuery(existing, newQuery, newEmbeddings)` — merges similar queries using cosine similarity (threshold 0.92) or appends new
- `cosineSimilarity(a, b)` — vector similarity calculation
- `isValidImageUrl(url)` — HEAD request to verify image content type

## `@poupaia/image`
**Product image generation.**

Key exports:
- `generateProductImage({ imageUrl, title, originalPrice, currentPrice })` — creates a 1000x1000 JPEG composite using Sharp: product image (500x500) + SVG overlay with price box and discount badge. Returns `Buffer`.

Dependencies: `sharp`, `node-fetch`.
