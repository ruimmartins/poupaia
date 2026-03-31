import { User, Message, updateUserState, getAllCategories } from '@poupaia/db';
import { interestsPrompt, InterestsIntentTypeEnum, InterestsResponse, processUserMessage, generateEmbedding } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import { mergeOrAppendQuery } from '@poupaia/shared';
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
        escapeMarkdownV2(`Guardei ${savedCount} interesse(s) teu(s)! Vou avisar-te quando aparecerem produtos que combinam. 🔔`)
      );

      console.log(`[interestsWorkflow] Saved ${savedCount} interests for userId=${user.id}`);
      break;

    default:
      console.warn(`[interestsWorkflow] Unexpected type=${type}`);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
      break;
  }

  console.log('[interestsWorkflow] Done');
};
