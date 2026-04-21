import {
  updateUserState,
  UserStateEnum,
  getTopLevelCategories,
  saveUserInterests,
  getUserInterests,
} from '@poupaia/db';
import { escapeMarkdownV2, sendTelegramMessage, editTelegramMessage } from '@poupaia/messaging';
import { Db } from 'mongodb';

const CATEGORIES_PER_PAGE = 5;

interface CategoryState {
  selectedCategories: string[];
  page: number;
  messageId?: number;
}

// Armazenar temporariamente o estado de seleção por utilizador
const userCategoryStates = new Map<number, CategoryState>();

export const handleInterestsCommand = async (db: Db, chatId: number, userId: number): Promise<void> => {
  console.log(`[handleInterestsCommand] Start chatId=${chatId} userId=${userId}`);

  // Obter categorias atuais do utilizador
  const currentInterests = await getUserInterests(db, userId);

  // Inicializar estado
  userCategoryStates.set(userId, {
    selectedCategories: currentInterests,
    page: 0,
  });

  await showCategoriesPage(db, chatId, userId, 0);
};

export const handleCategoryCallback = async (db: Db, chatId: number, userId: number, callbackData: string, messageId?: number): Promise<void> => {
  console.log(`[handleCategoryCallback] chatId=${chatId} userId=${userId} data=${callbackData}`);

  const state = userCategoryStates.get(userId) || { selectedCategories: [], page: 0 };

  if (messageId) {
    state.messageId = messageId;
    userCategoryStates.set(userId, state);
  }

  if (callbackData.startsWith('cat_')) {
    // Toggle categoria usando índice
    const categoryIndex = parseInt(callbackData.replace('cat_', ''), 10);
    const allCategories = await getTopLevelCategories(db);
    const category = allCategories[categoryIndex];
    
    if (!category) {
      console.error(`[handleCategoryCallback] Invalid category index: ${categoryIndex}`);
      return;
    }
    
    const index = state.selectedCategories.indexOf(category);
    
    if (index > -1) {
      state.selectedCategories.splice(index, 1);
    } else {
      state.selectedCategories.push(category);
    }

    userCategoryStates.set(userId, state);
    await showCategoriesPage(db, chatId, userId, state.page, true);

  } else if (callbackData.startsWith('page_')) {
    // Navegar para página
    const page = parseInt(callbackData.replace('page_', ''), 10);
    state.page = page;
    userCategoryStates.set(userId, state);
    await showCategoriesPage(db, chatId, userId, page, true);

  } else if (callbackData === 'save_interests') {
    // Guardar seleção
    await saveUserInterests(db, userId, state.selectedCategories);
    userCategoryStates.delete(userId);

    await updateUserState(db, userId, { state: UserStateEnum.IDLE });

    const count = state.selectedCategories.length;
    await sendTelegramMessage(
      chatId,
      escapeMarkdownV2(`✅ Guardei ${count} categoria(s)! Vou enviar-te produtos dessas categorias quando o scraper encontrar novos produtos.`)
    );

  } else if (callbackData === 'cancel_interests') {
    // Cancelar
    userCategoryStates.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });
    await sendTelegramMessage(chatId, escapeMarkdownV2('❌ Seleção de categorias cancelada.'));
  }
};

const showCategoriesPage = async (db: Db, chatId: number, userId: number, page: number, edit: boolean = false): Promise<void> => {
  const allCategories = await getTopLevelCategories(db);
  const state = userCategoryStates.get(userId) || { selectedCategories: [], page: 0 };

  if (allCategories.length === 0) {
    await sendTelegramMessage(chatId, escapeMarkdownV2('Ainda não há categorias disponíveis na base de dados.'));
    userCategoryStates.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });
    return;
  }

  const totalPages = Math.ceil(allCategories.length / CATEGORIES_PER_PAGE);
  const startIndex = page * CATEGORIES_PER_PAGE;
  const endIndex = Math.min(startIndex + CATEGORIES_PER_PAGE, allCategories.length);
  const categoriesOnPage = allCategories.slice(startIndex, endIndex);

  // Criar botões para as categorias
  const categoryButtons = categoriesOnPage.map((category, index) => {
    const isSelected = state.selectedCategories.includes(category);
    // Usar índice em vez do nome completo para callback_data (evita limite de 64 bytes do Telegram)
    const categoryIndex = allCategories.indexOf(category);
    return [
      {
        text: `${isSelected ? '✅' : '⬜'} ${category}`,
        callback_data: `cat_${categoryIndex}`,
      },
    ];
  });

  // Botões de navegação
  const navigationButtons = [];
  if (page > 0) {
    navigationButtons.push({ text: '⬅️ Anterior', callback_data: `page_${page - 1}` });
  }
  if (page < totalPages - 1) {
    navigationButtons.push({ text: '➡️ Próxima', callback_data: `page_${page + 1}` });
  }

  // Botões de ação
  const actionButtons = [
    { text: '💾 Guardar', callback_data: 'save_interests' },
    { text: '❌ Cancelar', callback_data: 'cancel_interests' },
  ];

  const keyboard = [
    ...categoryButtons,
    ...(navigationButtons.length > 0 ? [navigationButtons] : []),
    actionButtons,
  ];

  const selectedCount = state.selectedCategories.length;
  const message = escapeMarkdownV2(
    `Seleciona as categorias que te interessam:\n\n` +
    `📄 Página ${page + 1} de ${totalPages}\n` +
    `✅ Selecionadas: ${selectedCount}`
  );

  if (edit && state.messageId) {
    await editTelegramMessage(chatId, state.messageId, message, keyboard as any);
  } else {
    const result = await sendTelegramMessage(chatId, message, keyboard as any);
    if (result.result?.message_id) {
      state.messageId = result.result.message_id;
      userCategoryStates.set(userId, state);
    }
  }
};
