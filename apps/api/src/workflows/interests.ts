import { User, Message, updateUserState, getAllCategories, searchProducts } from '@poupaia/db';
import { interestsPrompt, InterestsIntentTypeEnum, InterestsResponse, processUserMessage, generateEmbedding } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import { mergeOrAppendQuery, sendProductsToUser } from '@poupaia/shared';
import { Db } from 'mongodb';

export const handleInterestsWorkflow = async (db: Db, chatId: number, user: User, messages: Message[]): Promise<void> => {
  console.log(`[interestsWorkflow] Start chatId=${chatId} userId=${user.id} messages=${messages.length}`);

  const categories = await getAllCategories(db);
  const filteredCategories = [...new Set(categories.map(c => c.split(' > ')[0]))];

  const { type, interests } = await processUserMessage<InterestsResponse>(
    interestsPrompt(filteredCategories),
    messages.map(m => ({ role: m.type === 'user' ? 'user' : 'model', content: m.text }))
  );

  console.log(`[interestsWorkflow] type=${type} interests=${JSON.stringify(interests)}`);

  switch (type) {
    case InterestsIntentTypeEnum.SAVE_INTERESTS:
      if (!interests || interests.length === 0) {
        await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
        break;
      }

      let updatedQueries = user.queries || [];

      for (const interest of interests) {
        const embeddingInput = interest.categories.length > 0
          ? `${interest.query}, Category: ${interest.categories.join(', ')}`
          : interest.query;

        const embeddings = await generateEmbedding([embeddingInput]);
        const values = embeddings[0]?.values ?? [];

        console.log(`[interestsWorkflow] Embedding generated for interest="${interest.query}" length=${values.length}`);

        updatedQueries = mergeOrAppendQuery(updatedQueries, interest.query, values);
      }

      await updateUserState(db, user.id, { queries: updatedQueries });

      const savedCount = interests.length;
      await sendTelegramMessage(
        chatId,
        escapeMarkdownV2(`Guardei ${savedCount} interesse(s) teu(s)! Vou procurar produtos que combinam... 🔍`)
      );

      console.log(`[interestsWorkflow] Saved ${savedCount} interests for userId=${user.id}`);

      // Fazer pesquisa automática baseada apenas nos interesses adicionados nesta operação
      console.log(`[interestsWorkflow] Searching products based on newly added interests for userId=${user.id}`);
      
      try {
        const allProducts: any[] = [];

        for (const interest of interests) {
          const embeddingInput = interest.categories.length > 0
            ? `${interest.query}, Category: ${interest.categories.join(', ')}`
            : interest.query;

          const embeddings = await generateEmbedding([embeddingInput]);
          const values = embeddings[0]?.values ?? [];

          if (!values || values.length === 0) {
            console.warn(`[interestsWorkflow] Skipping interest="${interest.query}" - no embeddings generated`);
            continue;
          }

          const products = await searchProducts(db, { embeddings: values });
          console.log(`[interestsWorkflow] Found ${products.length} products for interest="${interest.query}"`);
          
          allProducts.push(...products);
        }

        // Remover duplicados por ID
        const uniqueProducts = Array.from(new Map(allProducts.map(p => [p.id, p])).values());
        console.log(`[interestsWorkflow] Total unique products found: ${uniqueProducts.length}`);

        if (uniqueProducts.length > 0) {
          await sendProductsToUser(db, user.id, chatId, uniqueProducts);
        } else {
          await sendTelegramMessage(
            chatId,
            escapeMarkdownV2('Ainda não encontrei produtos que combinem com os teus interesses. Vou avisar-te assim que aparecerem! 🔔')
          );
        }
      } catch (error) {
        console.error('[interestsWorkflow] Error searching products:', error);
        await sendTelegramMessage(
          chatId,
          escapeMarkdownV2('Guardei os teus interesses, mas tive um problema ao procurar produtos. Vou tentar novamente mais tarde!')
        );
      }

      break;

    default:
      console.warn(`[interestsWorkflow] Unexpected type=${type}`);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
      break;
  }

  console.log('[interestsWorkflow] Done');
};
