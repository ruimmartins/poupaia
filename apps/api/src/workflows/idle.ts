import { idlePrompt, IdleIntentTypeEnum, processUserMessage, SearchResponse } from '@poupaia/ai';
import { Message, searchProducts, getAllCategories, updateUserState, createOrUpdateActivity, UserStateEnum, setMessegesAsProcessed } from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage, formatProductsForUser, sendTelegramPhoto, QUESTIONS } from '@poupaia/messaging';

export const handleIdleWorkflow = async (db: any, chatId: number, userId: number, messages: Message[]): Promise<void> => {
  console.log(`[idleWorkflow] Start chatId=${chatId} userId=${userId} messages=${messages.length}`);

  await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.LOADING)));

  const categories = await getAllCategories(db);
  console.log(`[idleWorkflow] Categories fetched count=${categories.length}`);

  const { type, intent } = await processUserMessage<SearchResponse>(idlePrompt(categories), messages.map(m => m.text).join(', '));
  console.log(`[idleWorkflow] AI result type=${type} intent=${JSON.stringify(intent)}`);

  await setMessegesAsProcessed(
    db,
    messages.map(m => m.id)
  );

  switch (type) {
    case IdleIntentTypeEnum.SEARCH:
    case IdleIntentTypeEnum.GIFT:
      console.log(`[idleWorkflow] ${type} — searching products with intent=${JSON.stringify(intent)}`);
      const products = await searchProducts(db, intent);
      console.log(`[idleWorkflow] Products found=${products.length}`);

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

        await updateUserState(db, userId, UserStateEnum.BROWSING);
        console.log('[idleWorkflow] User state updated to BROWSING');

        if (products.length < 5) {
          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.NO_MORE_PRODUCTS)));
        } else {
          await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(QUESTIONS.MORE_PRODUCTS_AVAILABLE)));
        }

        await createOrUpdateActivity(db, {
          userId,
          startedAt: new Date().toISOString(),
          productsSent: products,
          messages,
          intent,
        });
        console.log('[idleWorkflow] Activity saved');
      } else {
        console.log('[idleWorkflow] No products found — no message sent');
      }

      break;

    case IdleIntentTypeEnum.IRRELEVANT:
    default:
      console.log(`[idleWorkflow] type=${type} — sending irrelevant message`);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.IRRELEVANT_MESSAGE)));
      break;
  }

  console.log('[idleWorkflow] Done');
};
