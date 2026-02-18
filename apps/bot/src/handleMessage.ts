import {
  processUserMessage,
  formatProductsForUser,
  getSystemPrompt,
  ProductMessage,
} from '@poupaia/ai';
import {
  closeConnection,
  connectToDatabase,
  findProductsForUser,
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

    if (intent.type === 'irrelevant') {
      return [{ text: intent.responseMessage }];
    } else if (intent.type === 'delete_alert') {
      return [
        {
          text: 'Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀',
        },
      ];
    } else if (intent.type === 'alert') {
      const products = await findProductsForUser(db, intent.filters);
      return formatProductsForUser(products);
    } else if (intent.type === 'search') {
      const db = await connectToDatabase();

      let products;

      if (intent.filters?.searchQuery) {
        products = await searchProducts(db, intent.filters.searchQuery, {
          categories: intent.filters.categories,
          keywordGroups: intent.filters.keywordGroups,
          minPrice: intent.filters.minPrice,
          maxPrice: intent.filters.maxPrice,
          minDiscount: intent.filters.minDiscount,
          notExpired: intent.filters.notExpired,
          onlyGoodDeals: intent.filters.onlyGoodDeals,
          limit: intent.filters.limit,
        });
      } else {
        products = await findProductsForUser(db, intent.filters);
      }

      return formatProductsForUser(products);
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return [{ text: 'Desculpa, não consegui processar a tua mensagem. Podes reformular? 🤔' }];
  } finally {
    await closeConnection();
  }

  return [{ text: 'Ops, algo inesperado aconteceu. Tenta novamente mais tarde! 🚧' }];
};
