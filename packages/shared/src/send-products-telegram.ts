import { Db } from 'mongodb';
import { Product, saveMessage, updateUserState, UserStateEnum } from '@poupaia/db';
import { sendTelegramMessage, sendTelegramPhoto, formatProductsForUser, getRandomMessage, MESSAGES, escapeMarkdownV2, QUESTIONS } from '@poupaia/messaging';
import { TelegramAction } from 'packages/messaging/src/types/telegram-action';
import { isValidImageUrl } from './url-utils';

const PRODUCTS_PER_PAGE = 10;

export const sendProductsToUser = async (
  db: Db,
  userId: number,
  chatId: number,
  products: Product[],
  fromScraper: boolean = false
) => {
  // Se for do scraper, enviar todos os produtos, caso contrário limitar a 10
  const maxProducts = fromScraper ? products.length : PRODUCTS_PER_PAGE;
  const sentProducts: Product[] = products.slice(0, maxProducts);

  await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(sentProducts.length))));

  const productMessages = formatProductsForUser(sentProducts);
  for (const message of productMessages) {
    if (message.imageUrl && (await isValidImageUrl(message.imageUrl))) {
      await sendTelegramPhoto(chatId, message.imageUrl, message.text);
    } else {
      await sendTelegramMessage(chatId, message.text);
    }
  }

  // Se for do scraper, não enviar ações nem atualizar estado
  if (fromScraper) {
    return sentProducts;
  }

  await updateUserState(db, userId, { state: UserStateEnum.BROWSING });
  console.log('[idleWorkflow] User state updated to BROWSING');

  let systemFollowUpMessage = getRandomMessage(MESSAGES.NO_MORE_PRODUCTS);
  let systemFollowUpActions: TelegramAction[] = [{ text: 'nova pesquisa', callback_data: 'new_search' }];

  if (products.length > PRODUCTS_PER_PAGE) {
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
