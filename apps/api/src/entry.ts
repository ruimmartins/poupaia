import { handleIdleWorkflow } from './workflows/idle';
import { handleBrowsingWorkflow } from './workflows/browsing';
import { handleInterestsWorkflow } from './workflows/interests';
import { closeConnection, connectToDatabase, createOrUpdateActivity, getLastActivity, getOrCreateUser, getUnprocessedMessagesForUser, saveMessage, searchProducts, UserStateEnum } from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import { processUserMessage, relatedMessagesPrompt } from '@poupaia/ai';
import { sendProductsToUser } from 'packages/shared/src/send-products-telegram';
import { UserActionEnum } from './types/user-actions';

export const handleRequest = async (message: any): Promise<void> => {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  console.log(`[handleRequest] Start userId=${userId} chatId=${chatId} text="${message.text}"`);

  try {
    const db = await connectToDatabase();
    console.log('[handleRequest] DB connected');

    const user = await getOrCreateUser(db, userId, chatId, { ...message.from });
    console.log(`[handleRequest] User state=${user.state} userId=${userId}`);

    await saveMessage(db, {
      id: null,
      type: 'user',
      userId,
      text: message.text,
      timestamp: new Date(),
      processed: false,
    });
    console.log('[handleRequest] Message saved, waiting debounce...');

    await new Promise(resolve => setTimeout(resolve, 5000));

    const unprocessedMessages = await getUnprocessedMessagesForUser(db, userId);
    console.log(`[handleRequest] Unprocessed messages count=${unprocessedMessages.length}`);

    const lastMessage = unprocessedMessages.at(-1);
    if (lastMessage?.timestamp && new Date().getTime() - new Date(lastMessage.timestamp).getTime() < 5000) {
      console.log('[handleRequest] Newer message detected — skipping this one');
      return;
    }

    console.log(`[handleRequest] Routing to workflow for state=${user.state}`);
    switch (user.state) {
      case UserStateEnum.SETTING_INTERESTS:
        await handleInterestsWorkflow(db, chatId, user, unprocessedMessages);
        break;
      case UserStateEnum.IDLE:
        await handleIdleWorkflow(db, chatId, user, unprocessedMessages);
        break;
      case UserStateEnum.BROWSING:
        if (message.text.toLowerCase().includes(UserActionEnum.VIEW_MORE)) {
          const lastActivity = await getLastActivity(db, userId);
          if (lastActivity) {
            const products = await searchProducts(db, lastActivity.intent);
            console.log(`[idleWorkflow] Products found=${products.length}`);

            if (products.length > 0) {
              await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(products.length))));

              const sentProducts = await sendProductsToUser(db, user.id, chatId, products);

              lastActivity.productsSent = [...(lastActivity.productsSent || []), ...sentProducts];

              await createOrUpdateActivity(db, lastActivity);

              console.log('[idleWorkflow] Activity saved');
            } else {
              console.log('[idleWorkflow] No products found — no message sent');
            }
          }
        } else if (message.text.toLowerCase().includes(UserActionEnum.MORE_INFO)) {
        } else if (message.text.toLowerCase().includes(UserActionEnum.NEW_SEARCH)) {
        }

        /* const lastActivity = await getLastActivity(db, userId);
        console.log(`[handleRequest] Last activity found=${!!lastActivity} productsSent=${lastActivity?.productsSent?.length ?? 0}`);

        const isMessageRelatedToLastActivity = await processUserMessage<{ related: boolean }>(
          relatedMessagesPrompt([lastActivity?.trigger || '']),
          unprocessedMessages.map(m => ({ role: m.type === 'user' ? 'user' : 'model', content: m.text }))
        );
        console.log(`[handleRequest] Message related to last activity=${isMessageRelatedToLastActivity.related}`);

        if (!isMessageRelatedToLastActivity.related) {
          await handleIdleWorkflow(db, chatId, user, message.text);
        } else {
          await handleBrowsingWorkflow(db, chatId, user, lastActivity, unprocessedMessages);
        } */
        break;
      default:
        console.warn(`[handleRequest] Unknown state=${user.state} — sending fallback message`);
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.SOMETHING_WENT_WRONG)));
    }

    console.log('[handleRequest] Done');
    return;
  } catch (error) {
    console.error('[handleRequest] Error processing message:', error);
    await sendTelegramMessage(message.chat.id, escapeMarkdownV2(getRandomMessage(MESSAGES.SOMETHING_WENT_WRONG)));
    return;
  } finally {
    await closeConnection();
    console.log('[handleRequest] DB connection closed');
  }
};
