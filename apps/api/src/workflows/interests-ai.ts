import { updateUserState, UserStateEnum, getTopLevelCategories, saveUserInterests, getUserInterests, InterestItem, searchProductsByInterests } from '@poupaia/db';
import { extractInterests, generateEmbedding } from '@poupaia/ai';
import { escapeMarkdownV2, sendTelegramMessage, editTelegramMessage } from '@poupaia/messaging';
import { sendProductsToUser } from '@poupaia/shared';
import { Db } from 'mongodb';

interface PendingExtraction {
  operations: {
    action: 'add' | 'update' | 'remove';
    interest: {
      query: string;
      categories: string[];
      brands?: string[];
      includeKeywords?: string[];
      excludeKeywords?: string[];
    };
    targetQuery?: string;
  }[];
  messageId?: number;
}

const pendingExtractions = new Map<number, PendingExtraction>();

const formatInterestLine = (op: PendingExtraction['operations'][0]): string => {
  const { action, interest } = op;
  const cats = interest.categories.join(', ');
  const details: string[] = [];

  if (interest.brands?.length) {
    details.push(`marcas: ${interest.brands.join(', ')}`);
  }
  if (interest.includeKeywords?.length) {
    details.push(`inclui: ${interest.includeKeywords.join(', ')}`);
  }
  if (interest.excludeKeywords?.length) {
    details.push(`exclui: ${interest.excludeKeywords.join(', ')}`);
  }

  const detailStr = details.length > 0 ? ` (${details.join('; ')})` : '';

  switch (action) {
    case 'add':
      return `➕ Novo: *${interest.query}* — ${cats}${detailStr}`;
    case 'update':
      return `✏️ Atualizar: *${op.targetQuery}*${detailStr}`;
    case 'remove':
      return `🗑️ Remover: *${op.targetQuery || interest.query}*`;
    default:
      return `• ${interest.query}`;
  }
};

const showConfirmation = async (chatId: number, userId: number, ops: PendingExtraction['operations'], edit: boolean = false): Promise<void> => {
  const state = pendingExtractions.get(userId);
  const lines = ops.map(formatInterestLine);

  const message = escapeMarkdownV2(
    `📋 Aqui está o que percebi:\n\n${lines.join('\n')}\n\nQueres confirmar estas alterações?`
  );

  const keyboard = [
    [{ text: '✅ Confirmar', callback_data: 'confirm_ai_interests' }],
    [{ text: '❌ Cancelar', callback_data: 'cancel_ai_interests' }],
  ];

  if (edit && state?.messageId) {
    await editTelegramMessage(chatId, state.messageId, message, keyboard as any);
  } else {
    const result = await sendTelegramMessage(chatId, message, keyboard as any);
    if (result.result?.message_id) {
      pendingExtractions.set(userId, { operations: ops, messageId: result.result.message_id });
    }
  }
};

export const handleInterestsAICommand = async (db: Db, chatId: number, userId: number, messageText?: string): Promise<void> => {
  console.log(`[handleInterestsAICommand] chatId=${chatId} userId=${userId} text="${messageText}"`);

  if (!messageText) {
    const existingInterests = await getUserInterests(db, userId);

    let message: string;
    if (existingInterests.length > 0) {
      const interestLines = existingInterests.map(i => {
        const parts: string[] = [];
        if (i.brands?.length) parts.push(`marcas: ${i.brands.join(', ')}`);
        if (i.includeKeywords?.length) parts.push(`inclui: ${i.includeKeywords.join(', ')}`);
        if (i.excludeKeywords?.length) parts.push(`exclui: ${i.excludeKeywords.join(', ')}`);
        if (i.excludeBrands?.length) parts.push(`exclui marcas: ${i.excludeBrands.join(', ')}`);
        const detail = parts.length > 0 ? ` — ${parts.join('; ')}` : '';
        return `• *${i.query}* (${i.categories.join(', ')})${detail}`;
      });

      message = escapeMarkdownV2(
        `Os teus interesses atuais:\n\n${interestLines.join('\n')}\n\nQueres adicionar, remover ou ajustar algum? Escreve em linguagem natural!`
      );
    } else {
      message = escapeMarkdownV2(
        'Em que estás interessado? 🛒\n\nConta\\-me que produtos queres acompanhar e eu aviso\\-te quando aparecerem boas promoções!\n\nExemplos:\n• "quero sapatilhas Nike e Levi\'s"\n• "quero café em grão, telemóveis e calças"\n• "não quero brinquedos de menina"\n• "tira os telemóveis"'
      );
    }

    await sendTelegramMessage(chatId, message);
    return;
  }

  await sendTelegramMessage(chatId, escapeMarkdownV2('🔍 A analisar os teus interesses...'));

  const categories = await getTopLevelCategories(db);
  const existingInterests = await getUserInterests(db, userId);

  const existingForPrompt = existingInterests.map(i => ({
    query: i.query,
    categories: i.categories,
    brands: i.brands,
    includeKeywords: i.includeKeywords,
    excludeKeywords: [...(i.excludeKeywords || []), ...(i.excludeBrands || [])],
  }));

  const result = await extractInterests(messageText, categories, existingForPrompt);

  if (!result.operations || result.operations.length === 0) {
    await sendTelegramMessage(
      chatId,
      escapeMarkdownV2('Não consegui perceber que interesses querias adicionar. 😕\n\nTenta ser mais específico! Ex: "quero sapatilhas Nike e calças Levi\'s"')
    );
    return;
  }

  await showConfirmation(chatId, userId, result.operations);
};

export const handleInterestsAICallback = async (db: Db, chatId: number, userId: number, callbackData: string): Promise<void> => {
  console.log(`[handleInterestsAICallback] chatId=${chatId} userId=${userId} data=${callbackData}`);

  if (callbackData === 'cancel_ai_interests') {
    pendingExtractions.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });
    await sendTelegramMessage(chatId, escapeMarkdownV2('❌ Alterações canceladas.'));
    return;
  }

  if (callbackData === 'confirm_ai_interests') {
    const pending = pendingExtractions.get(userId);
    if (!pending) {
      await sendTelegramMessage(chatId, escapeMarkdownV2('⚠️ Já não há alterações pendentes. Usa /interesses para começar de novo.'));
      return;
    }

    const existingInterests = await getUserInterests(db, userId);
    let updatedInterests = [...existingInterests];

    for (const op of pending.operations) {
      switch (op.action) {
        case 'add': {
          updatedInterests.push({
            query: op.interest.query,
            categories: op.interest.categories,
            brands: op.interest.brands,
            includeKeywords: op.interest.includeKeywords,
            excludeKeywords: op.interest.excludeKeywords,
            createdAt: new Date().toISOString(),
          });
          break;
        }
        case 'update': {
          const idx = updatedInterests.findIndex(i => i.query === op.targetQuery);
          if (idx === -1) break;

          const existing = updatedInterests[idx];
          if (op.interest.brands?.length) {
            existing.brands = [...new Set([...(existing.brands || []), ...op.interest.brands])];
          }
          if (op.interest.includeKeywords?.length) {
            existing.includeKeywords = [...new Set([...(existing.includeKeywords || []), ...op.interest.includeKeywords])];
          }
          if (op.interest.excludeKeywords?.length) {
            existing.excludeKeywords = [...new Set([...(existing.excludeKeywords || []), ...op.interest.excludeKeywords])];
          }
          updatedInterests[idx] = existing;
          break;
        }
        case 'remove': {
          updatedInterests = updatedInterests.filter(i => i.query !== op.targetQuery);
          break;
        }
      }
    }

    const interestsNeedingEmbedding = updatedInterests.filter(i => !i.embedding || i.embedding.length === 0);
    if (interestsNeedingEmbedding.length > 0) {
      const queries = interestsNeedingEmbedding.map(i => i.query);
      const embeddings = await generateEmbedding(queries);

      for (let i = 0; i < interestsNeedingEmbedding.length; i++) {
        if (embeddings[i]?.values) {
          interestsNeedingEmbedding[i].embedding = embeddings[i].values;
        }
      }
    }

    const changedQueries = pending.operations
      .filter(op => op.action === 'add' || op.action === 'update')
      .map(op => op.interest.query || op.targetQuery)
      .filter(Boolean);

    await saveUserInterests(db, userId, updatedInterests);
    pendingExtractions.delete(userId);
    await updateUserState(db, userId, { state: UserStateEnum.IDLE });

    const affectedInterests = updatedInterests.filter(
      i => changedQueries.includes(i.query) && i.embedding && i.embedding.length > 0
    );

    let productsMessage = '';
    if (affectedInterests.length > 0) {
      const matchingProducts = await searchProductsByInterests(db, affectedInterests, {
        maxPerInterest: 5,
        minDiscountPercentage: 0,
      });

      if (matchingProducts.length > 0) {
        await sendProductsToUser(db, userId, chatId, matchingProducts, false);
        productsMessage = `\n\nEncontrei ${matchingProducts.length} produto(s) que correspondem aos teus novos interesses! 👆`;
      } else {
        productsMessage = '\n\nAinda não encontrei produtos para esses interesses, mas fico atento! 🔍';
      }
    }

    const lines = updatedInterests.map(i => {
      const parts: string[] = [];
      if (i.brands?.length) parts.push(`marcas: ${i.brands.join(', ')}`);
      if (i.excludeKeywords?.length) parts.push(`exclui: ${i.excludeKeywords.join(', ')}`);
      const detail = parts.length > 0 ? ` — ${parts.join('; ')}` : '';
      return `• *${i.query}* (${i.categories.join(', ')})${detail}`;
    });

    const msg = updatedInterests.length > 0
      ? `✅ Interesses guardados!\n\nOs teus interesses atuais:\n\n${lines.join('\n')}${productsMessage}`
      : '✅ Todos os interesses foram removidos. Usa /interesses para adicionar novos.';

    await sendTelegramMessage(chatId, escapeMarkdownV2(msg));
    return;
  }
};
