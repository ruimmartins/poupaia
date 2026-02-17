import { processUserMessage, formatProductsForUser, getSystemPrompt } from '@poupaia/ai';
import { sendTelegramMessage } from '@poupaia/messaging';
import { closeConnection, connectToDatabase, findProductsForUser, getAllCategories } from '@poupaia/db';

export const handleMessage = async (message: any): Promise<string> => {
  const chatId = message.chat.id;
  const userMessage = message.text;

  const db = await connectToDatabase()
  const categories = await getAllCategories(db)
  const SYSTEM_INSTRUCTIONS = getSystemPrompt(categories);

  // 1️⃣ Interpretar intenção com AI
  const intent = await processUserMessage(SYSTEM_INSTRUCTIONS, userMessage);

  if (intent.type === 'irrelevant') {
    return intent.responseMessage;
    /* await sendTelegramMessage(chatId, intent.responseMessage);
    return; */
  } else if (intent.type === 'delete_alert') {
    // Lógica para deletar alertas (a implementar)
    return "Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀";
    /* await sendTelegramMessage(
      chatId,
      'Funcionalidade de deletar alertas ainda não implementada. Fica atento às próximas atualizações! 🚀'
    ); */
  } else if (intent.type === 'alert') {
    
    const products = await findProductsForUser(db, intent.filters);
    const responseText = formatProductsForUser(products);
    return responseText;
    /* await sendTelegramMessage(chatId, responseText);
    return; */
  } else if (intent.type === 'search') {
    // 2️⃣ Buscar produtos no DB com filtros extraídos
    const db = await connectToDatabase()
    const products = await findProductsForUser(db, intent.filters);
    const responseText = formatProductsForUser(products);
    return responseText;
    /* await sendTelegramMessage(chatId, responseText);
    return; */
  }

  await closeConnection();

  return "Desculpa, não consegui processar a tua mensagem. Podes reformular? 🤔";
}
