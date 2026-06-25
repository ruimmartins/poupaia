import { handleInterestsCommand } from './workflows/interests';
import { handleNotifPrefsCommand } from './workflows/notif-prefs';
import { closeConnection, connectToDatabase, getOrCreateUser, updateUserState, UserStateEnum } from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, MESSAGES, getRandomMessage } from '@poupaia/messaging';

export const handleRequest = async (message: any): Promise<void> => {
  const userId = message.from?.id;
  const chatId = message.chat?.id;
  console.log(`[handleRequest] Start userId=${userId} chatId=${chatId} text="${message.text}"`);

  try {
    const db = await connectToDatabase();
    console.log('[handleRequest] DB connected');

    const user = await getOrCreateUser(db, userId, chatId, { ...message.from });
    console.log(`[handleRequest] User state=${user.state} userId=${userId}`);

    if (message.text?.trim() === '/start') {
      console.log('[handleRequest] /start command received');
      await sendTelegramMessage(chatId, MESSAGES.START(message.from?.first_name));
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_INTERESTS });
      await handleInterestsCommand(db, chatId, userId);
      return;
    }

    if (message.text?.trim() === '/interesses') {
      console.log('[handleRequest] /interesses command received');
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_INTERESTS });
      await handleInterestsCommand(db, chatId, userId);
      return;
    }

    if (message.text?.trim() === '/preferencias') {
      console.log('[handleRequest] /preferencias command received');
      await updateUserState(db, userId, { state: UserStateEnum.SETTING_NOTIF_PREFS });
      await handleNotifPrefsCommand(db, chatId, userId);
      return;
    }

    // Para qualquer outra mensagem, lembrar o utilizador de usar o menu de interesses
    await sendTelegramMessage(
      chatId,
      escapeMarkdownV2('Usa o comando /interesses para definir as tuas categorias favoritas e receber notificações de promoções!')
    );

    console.log('[handleRequest] Done');
    return;
  } catch (error) {
    console.error('[handleRequest] Error processing message:', error);
    await sendTelegramMessage(message.chat.id, escapeMarkdownV2(getRandomMessage(MESSAGES.SOMETHING_WENT_WRONG)));
    return;
  } finally {
    await closeConnection();
    console.log('[handleRequest] DB connection closed');
  }
};
