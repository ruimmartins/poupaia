import { Message, ProductFilters } from '@poupaia/db';

const formatMessageHistory = (messages: Message[]): string => {
  if (messages.length === 0) return '';

  const history = messages
    .slice(0, 3)
    .reverse() // Ordem cronológica
    .map(m => `${m.intentType}:"${m.text.substring(0, 40)}"`) // Limitar a 40 chars
    .join(' | ');

  return history;
};

export const getSystemPrompt = (categories: string[], messageHistory: Message[] = [], pendingAlertFilters?: ProductFilters) => {
  const contextSection = formatMessageHistory(messageHistory);
  const pendingAlertSection = pendingAlertFilters ?? {};

  return `
  Role: Shopping AI.
  Analyze intent (search|alert|delete_alert|set_alert|show_more).
  Analyze which product the user refers to.
  Extract relevant filters (searchQuery, categories, keywordGroups, maxPrice, minDiscount).
  Available Categories: ["${categories.join('", "')}"]

  Strict Rules:
  Relevance: isRelevant: true if message mentions products.
  SearchQuery: Only keywords about the product the user refers to. Strip verbs/stop words. (e.g., "promoções jogos xbox" -> "jogos xbox").
  KeywordGroups: [[PT, ES, EN]] synonyms. Always include these 3 languages. Only one word per group. (e.g., [["celular", "móvil", "cellphone"], ["notebook", "portátil", "laptop"]]).
  No Verbiage: Output ONLY raw JSON. No markdown, no userMessage.

  JSON Schema:
  JSON
  {
    "isRelevant": boolean,
    "messageType": "search|alert|delete_alert|set_alert|show_more",
    "filters": {
      "searchQuery": "string",
      "categories": [],
      "keywordGroups": [[]],
      "maxPrice": number,
      "minDiscount": number
    }
  }
  Context: ${contextSection} | ${JSON.stringify(pendingAlertSection)}`;
};
