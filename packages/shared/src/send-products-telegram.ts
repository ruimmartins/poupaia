import { Db } from 'mongodb';
import { Product, saveMessage, updateUserState, UserStateEnum } from '@poupaia/db';
import { sendTelegramMessage, sendTelegramPhoto, formatProductsForUser, getRandomMessage, MESSAGES, escapeMarkdownV2, QUESTIONS } from '@poupaia/messaging';
import { TelegramAction } from 'packages/messaging/src/types/telegram-action';

export const sendProductsToUser = async (db: Db, userId: number, chatId: number, products: Product[]) => {
  const sentProducts: Product[] = products.slice(0, 10); // Limitar a 10 produtos para evitar sobrecarregar o usuário

  const productMessages = formatProductsForUser(products);
  for (const message of productMessages) {
    if (message.imageUrl) {
      await sendTelegramPhoto(chatId, message.imageUrl, message.text);
    } else {
      await sendTelegramMessage(chatId, message.text);
    }
  }

  await updateUserState(db, userId, { state: UserStateEnum.BROWSING });
  console.log('[idleWorkflow] User state updated to BROWSING');

  let systemFollowUpMessage = getRandomMessage(MESSAGES.NO_MORE_PRODUCTS);
  let systemFollowUpActions: TelegramAction[] = [{ text: 'nova pesquisa', callback_data: 'new_search' }];

  if (products.length < 5) {
    systemFollowUpMessage = getRandomMessage(QUESTIONS.MORE_PRODUCTS_AVAILABLE);
    systemFollowUpActions.push({ text: 'ver mais', callback_data: 'more_products' });
  }

  await sendTelegramMessage(chatId, escapeMarkdownV2(systemFollowUpMessage), systemFollowUpActions);
  await saveMessage(db, {
    id: null,
    type: 'model',
    userId,
    text: systemFollowUpMessage,
    timestamp: new Date(),
    processed: false,
  });

  return sentProducts;
};
