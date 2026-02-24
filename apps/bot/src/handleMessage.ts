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
import { escapeMarkdownV2, formatProductsForUser, sendTelegramMessage, sendTelegramPhoto } from '@poupaia/messaging';

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

    await sendTelegramMessage(chatId, escapeMarkdownV2('Já estou a ver isso! Só um segundinho... 😎'));

    if (!userId || !chatId) {
      await sendTelegramMessage(
        chatId,
        escapeMarkdownV2('Não consegui identificar o teu utilizador. Tenta novamente! 🤔')
      );
      return;
    }

    const db = await connectToDatabase();

    await getOrCreateUser(db, userId, message.from);

    if (await isUserBlocked(db, userId)) {
      await sendTelegramMessage(
        chatId,
        escapeMarkdownV2('🚫 Estás temporariamente bloqueado por enviar mensagens irrelevantes. Tenta novamente mais tarde.')
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

    /* console.log('Processed intent:', JSON.stringify(intent)); */

    await sendTelegramMessage(
      chatId,
      escapeMarkdownV2(intent.responseMessage)
    );

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
        escapeMarkdownV2('🚫 Detetámos que enviaste várias mensagens irrelevantes. Estás bloqueado temporariamente por 24 horas.')
      );
      return;
    }

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        await clearPendingAlertFilters(db, userId);
        await sendTelegramMessage(chatId, intent.responseMessage);
        return;

      case IntentType.DELETE_ALERT: {
        const deletedCount = await deleteUserAlerts(db, userId, intent.filters);

        if (deletedCount === 0) {
          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2('Não encontrei alertas com esses critérios para apagar. 🤷')
          );
          return;
        }

        await sendTelegramMessage(chatId, escapeMarkdownV2(`✅ ${deletedCount} alerta(s) apagado(s) com sucesso!`));
        return;
      }

      case IntentType.SEARCH:
      case IntentType.ALERT: {
        if (!intent.filters) intent.filters = {};

        if (intent.type === IntentType.ALERT) {
          await createAlert(db, {
            userId,
            chatId,
            searchQuery: intent.filters?.searchQuery || '',
            ...intent.filters,
          });

          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2('Acabei de criar o teu alerta e encontrei alguns produtos que correspondem aos teus critérios! Dá uma olhadela 👀')
          );

          await clearPendingAlertFilters(db, userId);
        }

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
            searchQuery: intent.filters.searchQuery ?? '',
            ...intent.filters,
          });

          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2(`😔 Não encontrei produtos com esses critérios.\n\nQueres que crie um alerta para te notificar quando aparecerem produtos relacionados com "${intent.filters.searchQuery}"?`)
          );
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await sendTelegramMessage(
      message.chat.id,
      escapeMarkdownV2('Não consegui perceber a tua mensagem. Podes reformular? 🤔')
    );
    return;
  } finally {
    await closeConnection();
  }
  return;
};
