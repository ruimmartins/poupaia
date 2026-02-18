# Configuração Vercel - Bot Telegram

## 1. Deploy na Vercel

1. Acede a https://vercel.com e faz login
2. Clica em "Add New Project"
3. Importa o repositório GitHub `poupaia`
4. **IMPORTANTE**: Na configuração do projeto:
   - **Root Directory**: apps/bot
   - **Framework Preset**: Other
   - **Node.js Version**: 20.x (recomendado)

## 2. Variáveis de Ambiente

Adiciona as seguintes variáveis no dashboard da Vercel (Settings → Environment Variables):

```
TELEGRAM_TOKEN=<teu_token_do_botfather>
GEMINI_API_KEY=<tua_api_key_do_gemini>
MONGODB_URI=<teu_mongodb_connection_string>
MONGODB_PRODUCTS_DB_NAME=<nome_da_database>
```

## 3. Deploy

1. Clica em "Deploy"
2. Aguarda o deploy terminar
3. Copia o URL do deployment (ex: `https://poupaia-bot.vercel.app`)

## 4. Configurar Webhook do Telegram

Depois do deploy, configura o webhook do Telegram:

### Opção A: Via Browser

Acede a este URL (substitui os valores):
```
https://api.telegram.org/bot<TEU_TELEGRAM_TOKEN>/setWebhook?url=https://<TEU_DOMINIO_VERCEL>/api/webhook
```

Exemplo:
```
https://api.telegram.org/bot123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11/setWebhook?url=https://poupaia-bot.vercel.app/api/webhook
```

### Opção B: Via cURL

```bash
curl -X POST "https://api.telegram.org/bot<TEU_TELEGRAM_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<TEU_DOMINIO_VERCEL>/api/webhook"}'
```

### Verificar Webhook

Para confirmar que o webhook foi configurado:
```
https://api.telegram.org/bot<TEU_TELEGRAM_TOKEN>/getWebhookInfo
```

Deves ver algo como:
```json
{
  "ok": true,
  "result": {
    "url": "https://poupaia-bot.vercel.app/api/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

## 5. Testar o Bot

1. Abre o Telegram e envia uma mensagem ao teu bot
2. Testa com: "quero computadores portáteis"
3. Verifica os logs no dashboard da Vercel (Functions → Logs)

## 6. Troubleshooting

### Bot não responde
- Verifica se o webhook está configurado: `/getWebhookInfo`
- Verifica os logs na Vercel: Functions → Select webhook function → Logs
- Confirma que todas as variáveis de ambiente estão definidas

### Erros de Database
- Verifica o `MONGODB_URI`
- Certifica-te que os índices foram criados: `pnpm ts-node packages/db/src/helpers/create-indexes.ts`

### Timeout
- As functions têm maxDuration de 30s (configurado em vercel.json)
- Se precisares de mais tempo, podes aumentar no plano Pro da Vercel

## Notas

- O endpoint é automaticamente exposto em `/api/webhook`
- A Vercel compila TypeScript automaticamente
- O pnpm workspaces é suportado via `installCommand` no vercel.json
- Cada deploy cria um novo URL de preview (útil para testar antes de ir para produção)
