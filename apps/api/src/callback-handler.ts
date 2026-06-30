import { handleInterestsAICallback, handleInterestsAICommand } from './workflows/interests-ai';
import { handleNotifPrefsCallback, handleNotifPrefsCommand } from './workflows/notif-prefs';
import { closeConnection, connectToDatabase, getOrCreateUser, updateUserState, UserStateEnum } from '@poupaia/db';

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

    if (user.state === UserStateEnum.SETTING_INTERESTS) {
      await handleInterestsAICallback(db, chatId, userId, callbackData);
    } else if (user.state === UserStateEnum.SETTING_NOTIF_PREFS) {
      await handleNotifPrefsCallback(db, chatId, userId, callbackData, messageId);
    } else if (callbackData === 'save_interests') {
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_INTERESTS });
      await handleInterestsAICommand(db, chatId, userId);
    } else if (callbackData === 'save_notif_prefs') {
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_NOTIF_PREFS });
      await handleNotifPrefsCommand(db, chatId, userId);
    } else {
      console.warn(`[handleCallbackQuery] Unhandled callback data="${callbackData}" for state=${user.state}`);
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
