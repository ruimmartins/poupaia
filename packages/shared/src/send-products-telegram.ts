import { Db } from 'mongodb';
import { markProductsAsSentToUser, Product } from '@poupaia/db';
import { sendTelegramMessage, sendTelegramPhoto, formatProductsForUser, getRandomMessage, MESSAGES, escapeMarkdownV2 } from '@poupaia/messaging';

export const sendProductsToUser = async (db: Db, userId: number, chatId: number, products: Product[]) => {
  await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(products.length))));
  for (const product of formatProductsForUser(products)) {
    if (product.imageUrl) {
      await sendTelegramPhoto(chatId, product.imageUrl, product.text);
    } else {
      await sendTelegramMessage(chatId, product.text);
    }
  }
  await markProductsAsSentToUser(
    db,
    userId,
    products.map(p => p.id)
  );
};
