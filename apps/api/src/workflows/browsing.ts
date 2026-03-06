import { User, Message, Activity, searchProducts, updateUserState } from '@poupaia/db';
import { browsingPrompt, BrowsingIntentTypeEnum, processUserMessage, BrowsingResponse } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage, formatProductsForUser, sendTelegramPhoto, QUESTIONS, formatMoreInfoMessage } from '@poupaia/messaging';
import { UserStateEnum } from 'packages/db/src/models/user';

export const handleBrowsingWorkflow = async (db: any, chatId: number, user: User, lastActivity: Activity | null, unprocessedMessages: Message[]): Promise<void> => {
  console.log(`[browsingWorkflow] Start chatId=${chatId} userId=${user.id} messages=${unprocessedMessages.length}`);

  const { type, intent } = await processUserMessage<BrowsingResponse>(browsingPrompt(lastActivity?.productsSent || []), unprocessedMessages.map(m => m.text).join(', '));
  console.log(`[browsingWorkflow] AI result type=${type} intent=${JSON.stringify(intent)}`);

  switch (type) {
    case BrowsingIntentTypeEnum.MORE_INFO:
      const product = lastActivity?.productsSent[(intent?.productIndex || 1) - 1];
      console.log(`[browsingWorkflow] MORE_INFO productIndex=${intent?.productIndex} found=${!!product}`);
      if (product && intent) {
        const message = formatMoreInfoMessage(product, intent);
        if (message.imageUrl) {
          await sendTelegramPhoto(chatId, message.imageUrl, message.text);
        } else {
          await sendTelegramMessage(chatId, message.text);
        }
      }
      break;

    case BrowsingIntentTypeEnum.MORE_PRODUCTS:
      console.log(`[browsingWorkflow] MORE_PRODUCTS searching with intent=${JSON.stringify(lastActivity?.intent)}`);
      const products = await searchProducts(db, lastActivity?.intent);
      console.log(`[browsingWorkflow] Products found=${products.length}`);
      if (products.length > 0) {
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(products.length))));

        const productMessages = formatProductsForUser(products.slice(0, 5));
        for (const message of productMessages) {
          if (message.imageUrl) {
            await sendTelegramPhoto(chatId, message.imageUrl, message.text);
          } else {
            await sendTelegramMessage(chatId, message.text);
          }
        }

        await updateUserState(db, user.id, UserStateEnum.BROWSING);
        console.log('[browsingWorkflow] User state kept as BROWSING');

        if (products.length < 5) {
          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.NO_MORE_PRODUCTS)));
        } else {
          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(QUESTIONS.MORE_PRODUCTS_AVAILABLE)));
        }
      } else {
        console.log('[browsingWorkflow] No products found for intent');
      }
      break;

    default:
      console.warn(`[browsingWorkflow] Unrecognised type=${type} — sending fallback message`);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
      break;
  }

  console.log('[browsingWorkflow] Done');
};
