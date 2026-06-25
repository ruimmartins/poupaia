import { updateUserState, UserStateEnum, getUsersCollection, NotificationPrefs } from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, editTelegramMessage } from '@poupaia/messaging';
import { Db } from 'mongodb';

type DiscountLevel = 'razoavel' | 'bom' | 'excelente';

const DISCOUNT_LEVELS: { level: DiscountLevel; label: string }[] = [
  { level: 'razoavel', label: 'Razoável' },
  { level: 'bom', label: 'Bom' },
  { level: 'excelente', label: 'Excelente' },
];

const MAX_RESULTS_OPTIONS = [10, 20, 50, 0]; // 0 = sem limite

interface NotifPrefsState {
  minDiscountLevel: DiscountLevel;
  maxResultsPerCategory: number;
  messageId?: number;
}

const userNotifPrefsStates = new Map<number, NotifPrefsState>();

export const handleNotifPrefsCommand = async (db: Db, chatId: number, userId: number): Promise<void> => {
  const collection = await getUsersCollection(db);
  const user = await collection.findOne({ id: userId });
  const currentPrefs: NotificationPrefs = user?.notificationPrefs ?? { minDiscountLevel: 'razoavel', maxResultsPerCategory: 0 };

  userNotifPrefsStates.set(userId, { minDiscountLevel: currentPrefs.minDiscountLevel, maxResultsPerCategory: currentPrefs.maxResultsPerCategory });

  await showNotifPrefsPage(db, chatId, userId);
};

export const handleNotifPrefsCallback = async (db: Db, chatId: number, userId: number, callbackData: string, messageId?: number): Promise<void> => {
  const state = userNotifPrefsStates.get(userId) || { minDiscountLevel: 'razoavel' as DiscountLevel, maxResultsPerCategory: 0 };

  if (messageId) {
    state.messageId = messageId;
    userNotifPrefsStates.set(userId, state);
  }

  if (callbackData.startsWith('minLevel_')) {
    const level = callbackData.replace('minLevel_', '') as DiscountLevel;
    state.minDiscountLevel = level;
    userNotifPrefsStates.set(userId, state);
    await showNotifPrefsPage(db, chatId, userId, true);
  } else if (callbackData.startsWith('maxResults_')) {
    const value = parseInt(callbackData.replace('maxResults_', ''), 10);
    state.maxResultsPerCategory = value;
    userNotifPrefsStates.set(userId, state);
    await showNotifPrefsPage(db, chatId, userId, true);
  } else if (callbackData === 'save_notif_prefs') {
    const collection = await getUsersCollection(db);
    await collection.updateOne(
      { id: userId },
      { $set: { notificationPrefs: { minDiscountLevel: state.minDiscountLevel, maxResultsPerCategory: state.maxResultsPerCategory } } }
    );
    userNotifPrefsStates.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });
    await sendTelegramMessage(
      chatId,
      escapeMarkdownV2(
        `✅ Preferências guardadas\\!\n\n` +
        `• Nível mínimo: *${state.minDiscountLevel}*\n` +
        `• Máximo por categoria: *${state.maxResultsPerCategory === 0 ? 'Sem limite' : state.maxResultsPerCategory}*`
      )
    );
  } else if (callbackData === 'cancel_notif_prefs') {
    userNotifPrefsStates.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });
    await sendTelegramMessage(chatId, escapeMarkdownV2('❌ Configuração de preferências cancelada.'));
  }
};

const showNotifPrefsPage = async (db: Db, chatId: number, userId: number, edit: boolean = false): Promise<void> => {
  const state = userNotifPrefsStates.get(userId) || { minDiscountLevel: 'razoavel' as DiscountLevel, maxResultsPerCategory: 0 };

  const levelButtons = DISCOUNT_LEVELS.map(({ level, label }) => {
    const isSelected = state.minDiscountLevel === level;
    return { text: `${isSelected ? '✅' : '⬜'} ${label}`, callback_data: `minLevel_${level}` };
  });

  const resultsButtons = MAX_RESULTS_OPTIONS.map(value => {
    const label = value === 0 ? 'Sem limite' : `${value}`;
    const isSelected = state.maxResultsPerCategory === value;
    return { text: `${isSelected ? '✅' : '⬜'} ${label}`, callback_data: `maxResults_${value}` };
  });

  const actionButtons = [
    { text: '💾 Guardar', callback_data: 'save_notif_prefs' },
    { text: '❌ Cancelar', callback_data: 'cancel_notif_prefs' },
  ];

  const keyboard = [levelButtons, resultsButtons, actionButtons];

  const resultsLabel = state.maxResultsPerCategory === 0 ? 'Sem limite' : `${state.maxResultsPerCategory}`;

  const message = escapeMarkdownV2(
    `⚙️ *Preferências de notificação*\n\n` +
    `*Nível mínimo:* ${state.minDiscountLevel}\n` +
    `*Máx\\. por categoria:* ${resultsLabel}`
  );

  if (edit && state.messageId) {
    await editTelegramMessage(chatId, state.messageId, message, keyboard as any);
  } else {
    const result = await sendTelegramMessage(chatId, message, keyboard as any);
    if (result.result?.message_id) {
      state.messageId = result.result.message_id;
      userNotifPrefsStates.set(userId, state);
    }
  }
};
