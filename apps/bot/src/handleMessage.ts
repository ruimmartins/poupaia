import { processUserMessage, getSystemPrompt, ProductMessage, IntentType } from '@poupaia/ai';
import {
  closeConnection,
  connectToDatabase,
  searchProducts,
  getAllCategories,
  createAlert,
  deleteUserAlerts,
  saveMessage,
  shouldBlockUser,
  isUserBlocked,
  blockUser,
  getOrCreateUser,
  getLastUserMessages,
  getUserSentProducts,
  markProductsAsSentToUser,
  setPendingAlertFilters,
  getPendingAlertFilters,
  clearPendingAlertFilters,
  ProductFilters,
} from '@poupaia/db';
import { formatProductsForUser, sendTelegramMessage, sendTelegramPhoto } from '@poupaia/messaging';

const searchAndFilterProducts = async (
  db: any,
  userId: number,
  searchQuery: string,
  filters: Partial<ProductFilters>
) => {
  const userSentProductIds = await getUserSentProducts(db, userId);

  const allProducts = await searchProducts(db, searchQuery, filters);

  const newProducts = allProducts.filter(p => !userSentProductIds.includes(p.id));

  if (newProducts.length > 0) {
    await markProductsAsSentToUser(
      db,
      userId,
      newProducts.map(p => p.id)
    );
  }

  return newProducts;
};

export const handleMessage = async (message: any): Promise<void> => {
  try {
    const userMessage = message.text;
    const userId = message.from?.id;
    const chatId = message.chat?.id;

    if (!userId || !chatId) {
      await sendTelegramMessage(
        chatId,
        'Não consegui identificar o teu utilizador. Tenta novamente! 🤔'
      );
      return;
    }

    const db = await connectToDatabase();

    await getOrCreateUser(db, userId, {
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
      username: message.from?.username,
    });

    if (await isUserBlocked(db, userId)) {
      await sendTelegramMessage(
        chatId,
        '🚫 Estás temporariamente bloqueado por enviar mensagens irrelevantes. Tenta novamente mais tarde.'
      );
      return;
    }

    const categories = await getAllCategories(db);

    const messageHistory = await getLastUserMessages(db, userId, 3);
    const pendingAlertFilters = await getPendingAlertFilters(db, userId);

    const SYSTEM_INSTRUCTIONS = getSystemPrompt(
      categories,
      messageHistory,
      pendingAlertFilters || undefined
    );

    const intent = await processUserMessage(SYSTEM_INSTRUCTIONS, userMessage);

    console.log('Processed intent:', JSON.stringify(intent));

    await saveMessage(db, {
      userId,
      chatId,
      text: userMessage,
      intentType: intent.type,
    });

    if (await shouldBlockUser(db, userId)) {
      await blockUser(db, userId, 24);
      await sendTelegramMessage(
        chatId,
        '🚫 Detetámos que enviaste várias mensagens irrelevantes. Estás bloqueado temporariamente por 24 horas.'
      );
      return;
    }

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        await clearPendingAlertFilters(db, userId);
        await sendTelegramMessage(chatId, intent.responseMessage);
        return;

      case IntentType.DELETE_ALERT: {
        const deletedCount = await deleteUserAlerts(db, userId, intent.deleteAlertData);

        if (deletedCount === 0) {
          await sendTelegramMessage(
            chatId,
            'Não encontrei alertas com esses critérios para apagar. 🤷'
          );
          return;
        }

        await sendTelegramMessage(chatId, `✅ ${deletedCount} alerta(s) apagado(s) com sucesso!`);
        return;
      }

      case IntentType.ALERT: {
        if (!intent.alertData) {
          await sendTelegramMessage(
            chatId,
            'Não consegui perceber os critérios do alerta. Podes reformular? 🤔'
          );
          return;
        }

        await createAlert(db, {
          userId,
          chatId,
          searchQuery: intent.filters?.searchQuery || '',
          categories: intent.alertData.criteria.categories,
          keywordGroups: intent.alertData.criteria.keywordGroups,
          maxPrice: intent.alertData.criteria.maxPrice,
          minDiscount: intent.alertData.criteria.minDiscountPercent,
        });

        await clearPendingAlertFilters(db, userId);

        const newProducts = await searchAndFilterProducts(
          db,
          userId,
          intent.filters?.searchQuery || '',
          intent.filters || {}
        );

        if (newProducts.length > 0) {
          await sendTelegramMessage(
            chatId,
            'Acabei de criar o teu alerta e encontrei alguns produtos que correspondem aos teus critérios! Dá uma olhadela 👀'
          );
          for (const product of formatProductsForUser(newProducts)) {
            if (product.imageUrl) {
              await sendTelegramPhoto(chatId, product.imageUrl, product.text);
            } else {
              await sendTelegramMessage(chatId, product.text);
            }
          }
          return;
        } else {
          await sendTelegramMessage(
            chatId,
            'Acabei de criar o teu alerta, mas não encontrei nenhum produto que corresponda aos teus critérios no momento. Vou ficar a aguardar e notifico-te assim que aparecer algo interessante! 🔔'
          );
          return;
        }
      }

      case IntentType.SEARCH: {
        if (!intent.filters) intent.filters = {};

        const newProducts = await searchAndFilterProducts(
          db,
          userId,
          intent.filters.searchQuery || '',
          intent.filters
        );

        if (newProducts.length > 0) {
          await clearPendingAlertFilters(db, userId);
          for (const product of formatProductsForUser(newProducts)) {
            if (product.imageUrl) {
              await sendTelegramPhoto(chatId, product.imageUrl, product.text);
            } else {
              await sendTelegramMessage(chatId, product.text);
            }
          }
        } else {
          await setPendingAlertFilters(db, userId, {
            searchQuery: intent.filters.searchQuery || '',
            categories: intent.filters.categories,
            keywordGroups: intent.filters.keywordGroups,
            minPrice: intent.filters.minPrice,
            maxPrice: intent.filters.maxPrice,
            minDiscount: intent.filters.minDiscount,
          });

          await sendTelegramMessage(
            chatId,
            `😔 Não encontrei produtos com esses critérios.\n\nQueres que crie um alerta para te notificar quando aparecerem produtos relacionados com "${intent.filters.searchQuery}"?`
          );
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await sendTelegramMessage(
      message.chat.id,
      'Não consegui perceber a tua mensagem. Podes reformular? 🤔'
    );
    return;
  } finally {
    await closeConnection();
  }
  return;
};
