import { Db } from 'mongodb';
import { Product, saveMessage, updateUserState, UserStateEnum } from '@poupaia/db';
import { sendTelegramMessage, sendTelegramPhoto, formatProductsForUser, getRandomMessage, MESSAGES, escapeMarkdownV2, QUESTIONS } from '@poupaia/messaging';

export const sendProductsToUser = async (db: Db, userId: number, chatId: number, products: Product[]) => {
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

  let systemFollowUpMessage = getRandomMessage(QUESTIONS.MORE_PRODUCTS_AVAILABLE);

  if (products.length < 5) {
    systemFollowUpMessage = getRandomMessage(MESSAGES.NO_MORE_PRODUCTS);
  }

  await sendTelegramMessage(chatId, escapeMarkdownV2(systemFollowUpMessage));
  await saveMessage(db, {
    id: null,
    type: 'model',
    userId,
    text: systemFollowUpMessage,
    timestamp: new Date(),
    processed: false,
  });
};
