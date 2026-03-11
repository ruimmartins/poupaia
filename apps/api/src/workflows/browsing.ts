import { User, Message, Activity, searchProducts, createOrUpdateActivity } from '@poupaia/db';
import { browsingPrompt, BrowsingIntentTypeEnum, processUserMessage, BrowsingResponse } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage, sendTelegramPhoto, formatMoreInfoMessage } from '@poupaia/messaging';
import { sendProductsToUser } from '@poupaia/shared';
import { Db } from 'mongodb';

export const handleBrowsingWorkflow = async (db: Db, chatId: number, user: User, lastActivity: Activity | null, messages: Message[]): Promise<void> => {
  console.log(`[browsingWorkflow] Start chatId=${chatId} userId=${user.id} messages=${messages.length}`);

  const { type, intent } = await processUserMessage<BrowsingResponse>(
    browsingPrompt(lastActivity?.productsSent || []),
    messages.map(m => ({ role: m.type === 'user' ? 'user' : 'model', content: m.text }))
  );
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
      const products = await searchProducts(
        db,
        lastActivity?.intent,
        lastActivity?.productsSent?.map(p => p.id)
      );
      console.log(`[browsingWorkflow] Products found=${products.length}`);
      if (products.length > 0) {
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(products.length))));

        const productsToSend = products.slice(0, 5);

        await sendProductsToUser(db, user.id, chatId, productsToSend);

        if (lastActivity) await createOrUpdateActivity(db, { ...lastActivity, productsSent: [...(lastActivity.productsSent || []), ...productsToSend] });
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
