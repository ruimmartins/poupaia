import { processUserMessage, formatProductsForUser, getSystemPrompt, ProductMessage } from '@poupaia/ai';
import { sendTelegramMessage } from '@poupaia/messaging';
import { closeConnection, connectToDatabase, findProductsForUser, searchProducts, getAllCategories } from '@poupaia/db';

export const handleMessage = async (message: any): Promise<ProductMessage[]> => {
  const chatId = message.chat.id;
  const userMessage = message.text;

  const db = await connectToDatabase()
  const categories = await getAllCategories(db)
  const SYSTEM_INSTRUCTIONS = getSystemPrompt(categories);

  // 1️⃣ Interpretar intenção com AI
  const intent = await processUserMessage(SYSTEM_INSTRUCTIONS, userMessage);

  if (intent.type === 'irrelevant') {
    return [{ text: intent.responseMessage }];
    /* await sendTelegramMessage(chatId, intent.responseMessage);
    return; */
  } else if (intent.type === 'delete_alert') {
    // Lógica para deletar alertas (a implementar)
    return [{ text: "Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀" }];
    /* await sendTelegramMessage(
      chatId,
      'Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀'
    ); */
  } else if (intent.type === 'alert') {
    
    const products = await findProductsForUser(db, intent.filters);
    const responseMessages = formatProductsForUser(products);
    return responseMessages;
    /* await sendTelegramMessage(chatId, responseText);
    return; */
  } else if (intent.type === 'search') {
    // 2️⃣ Buscar produtos no DB com filtros extraídos
    const db = await connectToDatabase()

    console.log('Intent de busca com filtros:', JSON.stringify(intent, null, 2));
    
    let products;
    
    // Se tem searchQuery, usa text search orgânico
    if (intent.filters?.searchQuery) {
      products = await searchProducts(db, intent.filters.searchQuery, {
        categories: intent.filters.categories,
        keywordGroups: intent.filters.keywordGroups, // Filtro adicional para precisão
        minPrice: intent.filters.minPrice,
        maxPrice: intent.filters.maxPrice,
        minDiscount: intent.filters.minDiscount,
        notExpired: intent.filters.notExpired,
        onlyGoodDeals: intent.filters.onlyGoodDeals,
        limit: intent.filters.limit
      });
    } 
    // Caso contrário, usa findProductsForUser com keywordGroups
    else {
      products = await findProductsForUser(db, intent.filters);
    }
    
    const responseMessages = formatProductsForUser(products);
    return responseMessages;
    /* await sendTelegramMessage(chatId, responseText);
    return; */
  }

  await closeConnection();

  return [{ text: "Desculpa, não consegui processar a tua mensagem. Podes reformular? 🤔" }];
}
