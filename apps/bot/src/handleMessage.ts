import { sendProductsToUser } from '@poupaia/shared';
import { processUserMessage, getSystemPrompt, IntentType } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import {
  closeConnection,
  connectToDatabase,
  getAllCategories,
  createAlert,
  deleteUserAlerts,
  saveMessage,
  shouldBlockUser,
  isUserBlocked,
  blockUser,
  getOrCreateUser,
  getLastUserMessages,
  setPendingAlertFilters,
  getPendingAlertFilters,
  clearPendingAlertFilters,
  searchAndFilterProducts,
} from '@poupaia/db';

export const handleMessage = async (message: any): Promise<void> => {
  try {
    const userMessage = message.text;
    const userId = message.from?.id;
    const chatId = message.chat?.id;

    const db = await connectToDatabase();

    const user = await getOrCreateUser(db, userId, message.from);
    const categories = await getAllCategories(db);
    const messageHistory = await getLastUserMessages(db, userId, 3);
    const pendingAlertFilters = await getPendingAlertFilters(db, userId);

    if (!userId || !chatId) {
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.USER_NOT_FOUND)));
      return;
    }

    if (await isUserBlocked(db, user)) {
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.USER_BLOCKED)));
      return;
    }

    await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.LOADING)));

    const systemPrompt = getSystemPrompt(categories, messageHistory, pendingAlertFilters || undefined);
    const intent = await processUserMessage(systemPrompt, userMessage);

    /* console.log('Detected intent:', intent); */

    await saveMessage(db, {
      userId,
      chatId,
      text: userMessage,
      intentType: intent.type,
    });

    if (await shouldBlockUser(db, userId)) {
      await blockUser(db, userId, 24);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.USER_BLOCKED_24H)));
      return;
    }

    if (!intent.filters) intent.filters = {};

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        await clearPendingAlertFilters(db, userId);
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.IRRELEVANT_MESSAGE)));
        return;

      case IntentType.DELETE_ALERT: {
        const deletedCount = await deleteUserAlerts(db, userId, intent.filters);

        if (deletedCount === 0) {
          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.ALERTS_NOT_FOUND)));
          return;
        }

        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.ALERTS_DELETED(deletedCount))));
        return;
      }

      case IntentType.SEARCH:
        const newProducts = await searchAndFilterProducts(db, userId, intent.filters.searchQuery || '', intent.filters);

        if (newProducts.length > 0) {
          await clearPendingAlertFilters(db, userId);

          await sendProductsToUser(db, userId, chatId, newProducts);
        } else {
          await setPendingAlertFilters(db, userId, {
            searchQuery: intent.filters.searchQuery ?? '',
            ...intent.filters,
          });

          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_NOT_FOUND(intent.filters.searchQuery || ''))));
        }
        return;
      case IntentType.ALERT: {
        await createAlert(db, {
          userId,
          chatId,
          searchQuery: intent.filters?.searchQuery || '',
          ...intent.filters,
        });

        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.ALERT_CREATED)));

        await clearPendingAlertFilters(db, userId);

        const newProducts = await searchAndFilterProducts(db, userId, intent.filters.searchQuery || '', intent.filters);

        if (newProducts.length > 0) {
          await clearPendingAlertFilters(db, userId);
          if (intent.type === IntentType.ALERT) await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.ALERT_TRIGGERED(newProducts.length, intent.filters.searchQuery || ''))));
          await sendProductsToUser(db, userId, chatId, newProducts);
        }

        return;
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await sendTelegramMessage(message.chat.id, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
    return;
  } finally {
    await closeConnection();
  }
  return;
};
