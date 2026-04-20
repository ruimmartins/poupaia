import { handleIdleWorkflow } from './workflows/idle';
import { handleBrowsingWorkflow } from './workflows/browsing';
import { handleInterestsCommand, handleCategoryCallback } from './workflows/interests';
import { closeConnection, connectToDatabase, createOrUpdateActivity, getLastActivity, getOrCreateUser, getUnprocessedMessagesForUser, saveMessage, searchProducts, updateUserState, UserStateEnum } from '@poupaia/db';
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

    if (message.text?.trim() === '/start') {
      console.log('[handleRequest] /start command received');
      await sendTelegramMessage(chatId, MESSAGES.START(message.from?.first_name));
      return;
    }

    if (message.text?.trim() === '/interesses') {
      console.log('[handleRequest] /interesses command received');
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_INTERESTS });
      await handleInterestsCommand(db, chatId, userId);
      return;
    }

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

    console.log(`[handleRequest] Routing to workflow for state=${user.state}`);
    switch (user.state) {
      /* case UserStateEnum.SETTING_INTERESTS:
        await handleInterestsWorkflow(db, chatId, user, unprocessedMessages);
        break; */
      case UserStateEnum.IDLE:
        const unprocessedMessages = await getUnprocessedMessagesForUser(db, userId);
        console.log(`[handleRequest] Unprocessed messages count=${unprocessedMessages.length}`);

        const lastMessage = unprocessedMessages.at(-1);
        if (lastMessage?.timestamp && new Date().getTime() - new Date(lastMessage.timestamp).getTime() < 5000) {
          console.log('[handleRequest] Newer message detected — skipping this one');
          return;
        }

        await handleIdleWorkflow(db, chatId, user, unprocessedMessages);
        break;
      case UserStateEnum.BROWSING:
        if (message.text.toLowerCase().includes(UserActionEnum.VIEW_MORE)) {
          const lastActivity = await getLastActivity(db, userId);
          if (lastActivity) {
            const products = await searchProducts(db, lastActivity.intent, lastActivity.productsSent.map(p => p.id) || []);
            console.log(`[idleWorkflow] Products found=${products.length}`);

            if (products.length > 0) {
              const sentProducts = await sendProductsToUser(db, user.id, chatId, products);

              lastActivity.productsSent = [...(lastActivity.productsSent || []), ...sentProducts];

              await createOrUpdateActivity(db, lastActivity);

              console.log('[idleWorkflow] Activity saved');
            } else {
              console.log('[idleWorkflow] No products found — no message sent');
            }
          }
        } else if (message.text.toLowerCase().includes(UserActionEnum.MORE_INFO)) {
          await sendTelegramMessage(chatId, escapeMarkdownV2('Função ainda não implementada, mas já já você poderá clicar aqui para receber mais detalhes dos produtos que enviamos!'));
          await updateUserState(db, userId, { state: UserStateEnum.IDLE });
        } else if (message.text.toLowerCase().includes(UserActionEnum.NEW_SEARCH)) {
          await sendTelegramMessage(chatId, escapeMarkdownV2('Claro! O que você gostaria de encontrar?'));
          await updateUserState(db, userId, { state: UserStateEnum.IDLE });
        } else {
          await sendTelegramMessage(chatId, MESSAGES.NOT_UNDERSTOOD_BROWSING, [
            { text: '👀 Ver mais', callback_data: UserActionEnum.VIEW_MORE },
            { text: '💬 Mais info', callback_data: UserActionEnum.MORE_INFO },
            { text: '🔍 Nova pesquisa', callback_data: UserActionEnum.NEW_SEARCH },
          ]);
        }
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
