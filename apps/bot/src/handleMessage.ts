import { processUserMessage, getSystemPrompt, IntentType } from '@poupaia/ai';
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
import {
  escapeMarkdownV2,
  formatProductsForUser,
  sendTelegramMessage,
  sendTelegramPhoto,
  MESSAGES,
  getRandomMessage,
} from '@poupaia/messaging';

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

    await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.LOADING)));

    if (!userId || !chatId) {
      await sendTelegramMessage(
        chatId,
        escapeMarkdownV2(getRandomMessage(MESSAGES.USER_NOT_FOUND))
      );
      return;
    }

    const db = await connectToDatabase();

    await getOrCreateUser(db, userId, message.from);

    if (await isUserBlocked(db, userId)) {
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.USER_BLOCKED)));
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

    await sendTelegramMessage(chatId, escapeMarkdownV2(intent.responseMessage));

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
        escapeMarkdownV2(getRandomMessage(MESSAGES.USER_BLOCKED_24H))
      );
      return;
    }

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        await clearPendingAlertFilters(db, userId);
        await sendTelegramMessage(chatId, escapeMarkdownV2(intent.responseMessage));
        return;

      case IntentType.DELETE_ALERT: {
        const deletedCount = await deleteUserAlerts(db, userId, intent.filters);

        if (deletedCount === 0) {
          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2(getRandomMessage(MESSAGES.ALERTS_NOT_FOUND))
          );
          return;
        }

        await sendTelegramMessage(
          chatId,
          escapeMarkdownV2(getRandomMessage(MESSAGES.ALERTS_DELETED(deletedCount)))
        );
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
            escapeMarkdownV2(getRandomMessage(MESSAGES.ALERT_CREATED))
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
          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(newProducts.length)))
          );
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
            escapeMarkdownV2(
              getRandomMessage(MESSAGES.PRODUCTS_NOT_FOUND(intent.filters.searchQuery || ''))
            )
          );
          return;
        }
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    await sendTelegramMessage(
      message.chat.id,
      escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD))
    );
    return;
  } finally {
    await closeConnection();
  }
  return;
};
