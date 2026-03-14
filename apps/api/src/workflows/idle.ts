import { idlePrompt, IdleIntentTypeEnum, processUserMessage, SearchResponse, generateEmbedding } from '@poupaia/ai';
import { Message, searchProducts, getAllCategories, createOrUpdateActivity, setMessegesAsProcessed, User, updateUserState } from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import { sendProductsToUser } from '@poupaia/shared';
import { Db } from 'mongodb';

export const handleIdleWorkflow = async (db: Db, chatId: number, user: User, messages: Message[]): Promise<void> => {
  console.log(`[idleWorkflow] Start chatId=${chatId} userId=${user.id} messages=${messages.length}`);

  await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.LOADING)));

  const categories = await getAllCategories(db);
  const filteredCategories = [...new Set(categories.map(c => c.split(' > ')[0]))];
  console.log(`[idleWorkflow] Categories fetched count=${categories.length}`);

  const { type, intent } = await processUserMessage<SearchResponse>(
    idlePrompt(filteredCategories),
    messages.map(m => ({ role: m.type === 'user' ? 'user' : 'model', content: m.text }))
  );

  await setMessegesAsProcessed(
    db,
    messages.map(m => m.id)
  );

  switch (type) {
    case IdleIntentTypeEnum.SEARCH:
      const embeddings = await generateEmbedding([`${intent.query[0]}, Category: ${intent.categories.join(', ')}`]);
      intent.embeddings = embeddings[0].values ?? [];

      console.log(`[idleWorkflow] Embeddings generated for query="${intent.query[0]}" categories="${intent.categories.join(', ')}" with length=${intent.embeddings.length}`);

      console.log(`[idleWorkflow] AI result type=${type} intent=${JSON.stringify({ ...intent, embeddings: '...hidden...' })}`);
      /* console.log(`[idleWorkflow] ${type} — searching products with intent=${JSON.stringify(intent)}`); */
      await updateUserState(db, user.id, { queries: [...(user.queries || []), { query: intent.query[0], embeddings: intent.embeddings }] });
      const products = await searchProducts(db, intent);
      console.log(`[idleWorkflow] Products found=${products.length}`);

      if (products.length > 0) {
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.PRODUCTS_FOUND(products.length))));

        const sentProducts = await sendProductsToUser(db, user.id, chatId, products);

        await createOrUpdateActivity(db, {
          userId: user.id,
          startedAt: new Date().toISOString(),
          productsSent: sentProducts,
          trigger: messages.map(m => m.text).join('\n'),
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
