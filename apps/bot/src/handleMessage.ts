import {
  processUserMessage,
  formatProductsForUser,
  getSystemPrompt,
  ProductMessage,
  IntentType,
} from '@poupaia/ai';
import {
  closeConnection,
  connectToDatabase,
  searchProducts,
  getAllCategories,
} from '@poupaia/db';

export const handleMessage = async (message: any): Promise<ProductMessage[]> => {
  try {
    const userMessage = message.text;

    const db = await connectToDatabase();
    const categories = await getAllCategories(db);
    const SYSTEM_INSTRUCTIONS = getSystemPrompt(categories);

    const intent = await processUserMessage(SYSTEM_INSTRUCTIONS, userMessage);

    console.log('Processed intent:', JSON.stringify(intent, null, 2));

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        return [{ text: intent.responseMessage }];

      case IntentType.DELETE_ALERT:
        return [{ text: 'Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀' }];

      case IntentType.ALERT:
      case IntentType.SEARCH: {
        if (!intent.filters) intent.filters = {};
        const products = await searchProducts(db, intent.filters.searchQuery || '', {
          categories: intent.filters.categories,
          keywordGroups: intent.filters.keywordGroups,
          minPrice: intent.filters.minPrice,
          maxPrice: intent.filters.maxPrice,
          minDiscount: intent.filters.minDiscount,
          notExpired: intent.filters.notExpired,
          onlyGoodDeals: intent.filters.onlyGoodDeals,
          limit: intent.filters.limit,
        });
        return formatProductsForUser(products);
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return [{ text: 'Desculpa, não consegui processar a tua mensagem. Podes reformular? 🤔' }];
  } finally {
    await closeConnection();
  }

  return [{ text: 'Ops, algo inesperado aconteceu. Tenta novamente mais tarde! 🚧' }];
};
