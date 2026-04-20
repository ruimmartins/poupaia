import { handleCategoryCallback } from './workflows/interests';
import { closeConnection, connectToDatabase, getOrCreateUser, UserStateEnum } from '@poupaia/db';

export const handleCallbackQuery = async (callbackQuery: any): Promise<void> => {
  const userId = callbackQuery.from?.id;
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  const callbackData = callbackQuery.data;

  console.log(`[handleCallbackQuery] Start userId=${userId} chatId=${chatId} data="${callbackData}"`);

  try {
    const db = await connectToDatabase();
    console.log('[handleCallbackQuery] DB connected');

    const user = await getOrCreateUser(db, userId, chatId, { ...callbackQuery.from });
    console.log(`[handleCallbackQuery] User state=${user.state} userId=${userId}`);

    // Lidar com callbacks baseados no estado do utilizador
    if (user.state === UserStateEnum.SETTING_INTERESTS) {
      await handleCategoryCallback(db, chatId, userId, callbackData, messageId);
    } else {
      console.warn(`[handleCallbackQuery] Callback received but user is not in SETTING_INTERESTS state`);
    }

    console.log('[handleCallbackQuery] Done');
    return;
  } catch (error) {
    console.error('[handleCallbackQuery] Error processing callback:', error);
    return;
  } finally {
    await closeConnection();
    console.log('[handleCallbackQuery] DB connection closed');
  }
};
