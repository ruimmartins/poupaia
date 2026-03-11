import { User, Message } from '@poupaia/db';
import { idlePrompt, InterestsIntentTypeEnum, processUserMessage } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';
import { Db } from 'mongodb';

export const handleInterestsWorkflow = async (db: Db, chatId: number, user: User, messages: Message[]): Promise<void> => {
  console.log(`[interestsWorkflow] Start chatId=${chatId} userId=${user.id} messages=${messages.length}`);

  /* const { type, intent } = await processUserMessage(idlePrompt, userMessage); */

  const { type, intent } = {
    type: InterestsIntentTypeEnum.ADD_INTERESTS,
    intent: {
      query: ['monitor gaming'],
      minPrice: undefined,
      maxPrice: 150,
    },
  };

  console.log(`[interestsWorkflow] type=${type} intent=${JSON.stringify(intent)}`);

  switch (type) {
    case InterestsIntentTypeEnum.ADD_INTERESTS:
      console.log('[interestsWorkflow] ADD_INTERESTS — (not yet implemented)');
      break;

    case InterestsIntentTypeEnum.REMOVE_INTERESTS:
      console.log('[interestsWorkflow] REMOVE_INTERESTS — (not yet implemented)');
      break;

    default:
      console.warn(`[interestsWorkflow] Unknown type=${type} — sending fallback message`);
      await sendTelegramMessage(chatId, escapeMarkdownV2(getRandomMessage(MESSAGES.MESSAGE_NOT_UNDERSTOOD)));
      break;
  }

  console.log('[interestsWorkflow] Done');
};
