import { Message, ProductFilters } from '@poupaia/db';

const formatMessageHistory = (messages: Message[]): string => {
  if (messages.length === 0) return '';

  // Mostrar apenas últimas 3 mensagens, formato ultra-compacto
  const history = messages
    .slice(0, 3)
    .reverse() // Ordem cronológica
    .map(m => `${m.intentType}:"${m.text.substring(0, 40)}"`) // Limitar a 40 chars
    .join(' | ');

  return `\nCONTEXTO: ${history}`;
};

export const getSystemPrompt = (categories: string[], messageHistory: Message[] = [], pendingAlertFilters?: ProductFilters) => {
  const contextSection = formatMessageHistory(messageHistory);
  const pendingAlertSection = pendingAlertFilters ? `\n\nALERTA PENDENTE: O utilizador acabou de fazer uma pesquisa sem resultados. Se ele responder "sim", "quero", "cria", "ok" ou similar, deve criar um alerta com estes filtros: ${JSON.stringify(pendingAlertFilters)}` : '';

  return `Analisa mensagens e identifica produtos.${contextSection}${pendingAlertSection}

CAT: ${categories.join(', ')}

TIPOS: alert ("avisa"), search ("quero","há"), delete_alert ("cancela")

JSON:
{
  "isRelevant": bool,
  "messageType": "alert|search|delete_alert",
  "filters": {
    "searchQuery": "SEMPRE query limpa",
    "categories": ["cat"],
    "keywordGroups": [["pt","en"]],
    "maxPrice": num,
    "minDiscount": num
  },
  "userMessage": "msg"
}

searchQuery REGRAS:
- OBRIGATÓRIO (nunca vazio)
- Remove: "quero","há","me"
- Ex: "quero café" → "café"

keywordGroups:
- PT/EN obrigatório
- [[termo1,syn1],[termo2]]
- Ex: [["café","coffee"]]

EX:
"telemóveis" → {"isRelevant":true,"messageType":"search","filters":{"searchQuery":"telemóveis","keywordGroups":[["telemóvel","phone"]]},"userMessage":"A procurar..."}

"avisa portáteis" → {"isRelevant":true,"messageType":"alert","filters":{"searchQuery":"portáteis","keywordGroups":[["portátil","laptop"]]},"userMessage":"Ok!"}

"sapatilhas <40€" → {"isRelevant":true,"messageType":"search","filters":{"searchQuery":"sapatilhas","keywordGroups":[["sapatilhas","sneakers"]],"maxPrice":40},"userMessage":"A procurar..."}`;
};
