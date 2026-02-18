# 🔍 Sistema de Pesquisa de Produtos

## 🤖 Gemini AI + MongoDB Text Search

O sistema usa **Gemini AI** para extrair automaticamente uma `searchQuery` orgânica do input do utilizador, que é usada com o **MongoDB text search** para ordenação por relevância.

**IMPORTANTE**: O sistema agora **combina text search com keyword groups** para garantir precisão. Mesmo que o text search encontre muitos resultados, os `keywordGroups` filtram apenas produtos relevantes.

### Como funciona:

```
┌─────────────────────────────────────────────┐
│ Utilizador: "quero sapatilhas nike de homem"│
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────▼─────────┐
         │   Gemini AI       │
         │   Extrai:         │
         │   • searchQuery   │
         │   • categories    │
         │   • filters       │
         └─────────┬─────────┘
                   │
         ┌─────────▼──────────┐
         │  handleMessage     │
         │  Decide método:    │
         │  searchQuery?      │
         │   ├─ Sim → text    │
         │   └─ Não → regex   │
         └─────────┬──────────┘
                   │
         ┌─────────▼─────────┐
         │   MongoDB         │
         │   Busca produtos  │
         │   por relevância  │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Produtos         │
         │  ordenados por    │
         │  relevância       │
         └───────────────────┘
```

---

## 📋 Exemplos de Queries do Utilizador

### Exemplo 1: Pesquisa simples
**Input**: "quero café"

**Gemini extrai**:
```json
{
  "searchQuery": "café",
  "categories": ["Mercearia"],
  "limit": 10
}
```

**Sistema usa**: `searchProducts(db, "café", { categories: [...] })`

---

### Exemplo 2: Pesquisa com filtros
**Input**: "sapatilhas nike de homem a menos de 80€"

**Gemini extrai**:
```json
{
  "searchQuery": "sapatilhas nike homem",
  "categories": ["Roupa, sapatos e malas"],
  "maxPrice": 80,
  "keywordGroups": [
    ["sapatilhas", "sneakers"],
    ["homem", "men", "masculino"]
  ]
}
```

**Sistema**:
1. Text search encontra produtos relevantes com "sapatilhas nike homem"
2. KeywordGroups filtram: **deve ter** (sapatilhas OR sneakers) **E** (homem OR men OR masculino)
3. Retorna apenas sapatilhas de homem, **não** sapatilhas de criança ou mulher ✅

---

### Exemplo 3: Computadores portáteis
**Input**: "existe alguma promocao computadores portateis?"

**Gemini extrai**:
```json
{
  "searchQuery": "computadores portáteis",
  "categories": ["Eletrónica"],
  "keywordGroups": [
    ["computador", "laptop", "portátil", "notebook", "pc"]
  ]
}
```

**Sistema**:
1. Text search encontra produtos com "computadores portáteis"
2. KeywordGroups filtram: **deve ter** (computador OR laptop OR portátil OR notebook OR pc)
3. **Exclui** "Carregador portátil", "Rato para computador", etc ✅
4. Retorna apenas computadores/laptops completos

---

### Exemplo 4: Apenas "melhores ofertas"
**Input**: "mostra-me as melhores ofertas"

**Gemini extrai**:
```json
{
  "searchQuery": "ofertas",
  "onlyGoodDeals": true
}
```

**Sistema usa**: `searchProducts(db, "ofertas", { onlyGoodDeals: true })`

---

## 🎯 Lógica de Decisão no handleMessage

```typescript
// apps/bot/src/handleMessage.ts

if (intent.type === 'search') {
  let products;
  
  // Se tem searchQuery → usa text search (RECOMENDADO)
  if (intent.filters?.searchQuery) {
    products = await searchProducts(db, intent.filters.searchQuery, {
      categories: intent.filters.categories,
      maxPrice: intent.filters.maxPrice,
      minDiscount: intent.filters.minDiscount,
      // ... outros filtros
    });
  } 
  // Fallback → usa keyword groups com regex
  else {
    products = await findProductsForUser(db, intent.filters);
  }
  
  return formatProductsForUser(products);
}
```

---

## ⚙️ Como o Gemini Gera searchQuery

O system prompt instrui o Gemini a:

1. **Remover palavras desnecessárias**:
   - ❌ "quero", "procuro", "mostra", "me", "há"
   - ✅ Manter: produto, marca, características, género

2. **Exemplos de transformação**:
   ```
   "quero sapatilhas nike de homem"     → "sapatilhas nike homem"
   "mostra-me café em grão barato"      → "café grão"
   "preciso portátil gaming"            → "portátil gaming"
   "há promoções de televisões samsung" → "televisões samsung"
   ```

3. **Manter termos relevantes**:
   - Tipo de produto: "sapatilhas", "café", "portátil"
   - Marca: "nike", "samsung", "lenovo"
   - Características: "gaming", "grão", "4K"
   - Género/Idade: "homem", "criança", "unissexo"

---

## 🔥 Vantagens do Sistema Atual

### Text Search + Keyword Groups (HÍBRIDO):
- ✅ **Ordenação por relevância** do MongoDB text search
- ✅ **Text search APENAS no título** (category é filtro exato)
- ✅ **Filtragem precisa** com keywordGroups no título
- ✅ **Evita falsos positivos**: 
  - "computadores portáteis" → NÃO retorna "carregador portátil"
  - "sapatilhas de homem" → NÃO retorna "sapatilhas de criança"
- ✅ **Gemini gera keywords automaticamente** com traduções
- ✅ Performance rápida (text index no título + categoria como filtro exato)
- ✅ UX melhor: resultados relevantes E precisos

### Como evita falsos positivos:
1. **Categories** → filtro exato por categoria (não faz text search aqui)
2. **Text search** → encontra candidatos APENAS no título com as palavras-chave
3. **KeywordGroups** → regex no título garante que TODAS as keywords obrigatórias estão presentes
4. Exemplo: "computadores portáteis" na categoria "Eletrónica"
   - Category filter: category = "Eletrónica"
   - Text search no título: "computadores portáteis"
   - KeywordGroups no título: deve ter ("computador" OR "laptop" OR "portátil" OR "pc")
   - Resultado final: apenas laptops/computadores ✅

---

## 📊 System Prompt (Resumo)

```typescript
// packages/ai/src/system-prompt.ts

FILTROS DISPONÍVEIS:
- searchQuery: query orgânica limpa (SEMPRE gerar)
  * Remover: "quero", "procuro", "mostra", etc
  * Manter: produto, marca, características, género
  * Ex: "quero café em grão" → "café grão"

- categories: array de categorias da lista
- keywordGroups: grupos de keywords (OPCIONAL)
- maxPrice, minDiscount, onlyGoodDeals, etc

EXEMPLOS:
"quero café em grão barato"           → searchQuery: "café grão"
"procuro portátil gaming com desconto" → searchQuery: "portátil gaming"
"mostra ténis nike de corrida"        → searchQuery: "ténis nike corrida"
```

---

## ✅ Resultado Final

O utilizador apenas precisa enviar mensagens naturais:
- "quero café barato"
- "sapatilhas de homem"
- "mostra ofertas de telemóveis"

E o sistema:
1. **Gemini** extrai searchQuery + filtros
2. **handleMessage** usa text search automático
3. **MongoDB** retorna produtos por relevância
4. **Utilizador** recebe melhores resultados primeiro 🎯

---

## 🚀 Para Testar

```bash
# 1. Certifica-te que os indexes estão criados
cd packages/db
pnpm tsx src/helpers/create-indexes.ts

# 2. Testa com o bot
# Envia mensagens no Telegram:
# - "quero café"
# - "sapatilhas nike"
# - "portátil gaming barato"

# 3. Vê os logs para confirmar que usa searchProducts
```

---

**🎉 Tudo configurado! O sistema agora usa pesquisa orgânica com relevância automática via Gemini + MongoDB text search.**
