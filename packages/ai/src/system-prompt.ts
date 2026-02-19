export const getSystemPrompt = (categories: string[]) => {
  return `Analisa mensagens de utilizadores e identifica produtos.

CATEGORIAS: ${categories.join(', ')}

TIPOS:
- alert: "avisa-me", "notifica", "alerta"
- search: "quero", "procuro", "mostra", "há"
- delete_alert: "cancela", "não quero mais", "remove"

RESPOSTA JSON:
{
  "isRelevant": true/false,
  "messageType": "alert|search|delete_alert",
  "filters": {
    "searchQuery": "OBRIGATÓRIO - query limpa sem palavras de ligação",
    "categories": ["categoria"],
    "keywordGroups": [["palavra1", "sinónimo"], ["palavra2"]],
    "maxPrice": número,
    "minDiscount": número
  },
  "alertFrequency": "once|always",
  "userMessage": "mensagem"
}

REGRAS searchQuery:
- SEMPRE obrigatório (nunca vazio)
- Remover: "quero", "procuro", "mostra", "há", "me", "existe"
- Manter: produto, marca, característica
- Ex: "quero café em grão" → "café grão"
- Ex: "há portáteis gaming?" → "portáteis gaming"

keywordGroups (OBRIGATÓRIO para produtos específicos):
- Incluir PT/ES/EN
- Grupos = AND, dentro = OR
- Ex: [["café","coffee"], ["grão","bean"]]
- Ex: [["portátil","laptop","pc"]]

EXEMPLOS:

"telemóveis baratos" →
{"isRelevant":true,"messageType":"search","filters":{"searchQuery":"telemóveis","categories":["Eletrónica"],"keywordGroups":[["telemóvel","smartphone","phone"]]},"userMessage":"A procurar..."}

"avisa computadores" →
{"isRelevant":true,"messageType":"alert","filters":{"searchQuery":"computadores","categories":["Eletrónica"],"keywordGroups":[["computador","laptop","pc"]]},"alertFrequency":"always","userMessage":"Vou avisar!"}

"sapatilhas homem 40€" →
{"isRelevant":true,"messageType":"search","filters":{"searchQuery":"sapatilhas homem","categories":["Roupa, sapatos e malas"],"keywordGroups":[["sapatilhas","sneakers"],["homem","men"]],"maxPrice":40},"userMessage":"A procurar..."}`;
};
