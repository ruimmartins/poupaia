# Poupaia

Bot de Telegram que encontra promoções na Amazon.es e alerta os utilizadores com base nos seus interesses.

- **Scraper** — Playwright recolhe promoções da Amazon.es e guarda-as no MongoDB.
- **Bot** — servidor Express recebe webhooks do Telegram, interpreta mensagens com IA e pesquisa produtos via MongoDB Atlas Vector Search.
- **Notificações** — após cada scrape, os produtos que correspondem aos interesses de cada utilizador são enviados por Telegram.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 20, TypeScript 5.9 |
| Monorepo | pnpm 10 workspaces |
| API | Express 5 |
| Base de dados | MongoDB Atlas (vector search) |
| IA | Gemini 2.5 Flash Lite, Gemini Embedding (`gemini-embedding-001`, 384 dims), DeepSeek (`deepseek-chat`) |
| Scraping | Playwright + playwright-extra stealth |
| Imagens | Sharp |
| Deploy | Docker → Google Cloud Run via GitHub Actions |

## Estrutura

```
apps/
  api/        @poupaia/api          Webhook do bot (Express) — único serviço em Cloud Run
  scraper/    @poupaia/scraper-app  Runner do scraper
  tasks/      @poupaia/tasks        Tarefas agendadas (stub)

packages/
  ai/         @poupaia/ai           Gemini + DeepSeek, prompts e tipos de resposta
  db/         @poupaia/db           Cliente MongoDB, modelos e operações
  image/      @poupaia/image        Geração de imagens de produto
  messaging/  @poupaia/messaging    Telegram Bot API e templates de mensagens
  scraper/    @poupaia/scraper      Utilitários de browser Playwright
  shared/     @poupaia/shared       Envio de produtos, utilitários de vetores e URLs
```

Os packages exportam o código `.ts` diretamente (`main` → `src/index.ts`), sem necessidade de compilação local.

## Começar

Pré-requisitos: Node.js 20+, pnpm 10, cluster MongoDB Atlas com índice de vector search, chaves Gemini e DeepSeek, token de bot do Telegram ([@BotFather](https://t.me/BotFather)).

```bash
pnpm install
cp .env.example .env
pnpm exec playwright install
```

Variáveis em `.env` (na raiz do repositório):

```
MONGODB_URI=
MONGODB_PRODUCTS_DB_NAME=products
MONGODB_VECTOR_DIMENSIONS=384
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Ver [docs/getting-started.md](docs/getting-started.md) para variáveis opcionais e a definição do índice de vector search.

## Comandos

| Tarefa | Comando | Onde |
|--------|---------|------|
| API em desenvolvimento | `pnpm dev` | `apps/api` |
| API em produção | `pnpm start` | `apps/api` |
| Scraper | `pnpm scraper` | raiz |
| Typecheck de tudo | `pnpm build` | raiz |
| Formatar | `pnpm format` / `pnpm format:check` | raiz |

A API escuta na porta `3000` (ou `PORT`) com os endpoints `POST /` (webhook Telegram) e `GET /health`.

## Bot

Comandos: `/start`, `/interesses`, `/preferencias`.

Os utilizadores descrevem os interesses em linguagem natural (ex.: _"quero sapatilhas Nike e café em grão, mas sem cápsulas"_). O DeepSeek extrai operações de adicionar/atualizar/remover, o utilizador confirma e são gerados embeddings Gemini para cada interesse. Em `/preferencias` define-se o nível mínimo de desconto e o número máximo de resultados por categoria.

## Deploy

Push para `master` dispara [.github/workflows/deploy-gcp.yml](.github/workflows/deploy-gcp.yml), que faz build de `apps/api/Dockerfile`, publica no Artifact Registry e faz deploy no Cloud Run (`poupaia-bot`, `europe-west1`). A imagem corre `tsx` diretamente, sem pré-build. O scraper e as tasks correm fora do CI/CD.

## Documentação

- [Arquitetura](docs/architecture.md)
- [Começar](docs/getting-started.md)
- [Packages](docs/packages.md)
- [Base de dados](docs/database.md)
- [Workflows do bot](docs/bot-workflows.md)
- [Scraping](docs/scraping.md)
- [Deploy](docs/deployment.md)
