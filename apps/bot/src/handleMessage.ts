import {
  processUserMessage,
  getSystemPrompt,
  ProductMessage,
  IntentType,
} from '@poupaia/ai';
import {
  closeConnection,
  connectToDatabase,
  searchProducts,
  getAllCategories,
  createAlert,
  deleteUserAlerts,
  saveMessage,
  shouldBlockUser,
  isUserBlocked,
  blockUser,
  getOrCreateUser,
  getLastUserMessages,
  getUserSentProducts,
  markProductsAsSentToUser,
  setPendingAlertFilters,
  getPendingAlertFilters,
  clearPendingAlertFilters,
  ProductFilters,
} from '@poupaia/db';
import { formatProductsForUser } from '@poupaia/messaging';

const searchAndFilterProducts = async (
  db: any,
  userId: number,
  searchQuery: string,
  filters: Partial<ProductFilters>
) => {
  const userSentProductIds = await getUserSentProducts(db, userId);

  const allProducts = await searchProducts(db, searchQuery, filters);

  const newProducts = allProducts.filter(p => !userSentProductIds.includes(p.id));

  if (newProducts.length > 0) {
    await markProductsAsSentToUser(
      db,
      userId,
      newProducts.map(p => p.id)
    );
  }

  return newProducts;
};

export const handleMessage = async (message: any): Promise<ProductMessage[]> => {
  try {
    const userMessage = message.text;
    const userId = message.from?.id;
    const chatId = message.chat?.id;

    if (!userId || !chatId) {
      return [{ text: 'Não consegui identificar o teu utilizador. Tenta novamente! 🤔' }];
    }

    const db = await connectToDatabase();

    await getOrCreateUser(db, userId, {
      firstName: message.from?.first_name,
      lastName: message.from?.last_name,
      username: message.from?.username,
    });

    if (await isUserBlocked(db, userId)) {
      return [
        {
          text: '🚫 Foste temporariamente bloqueado por enviar mensagens irrelevantes. Tenta novamente mais tarde.',
        },
      ];
    }

    const categories = await getAllCategories(db);

    const messageHistory = await getLastUserMessages(db, userId, 3);
    const pendingAlertFilters = await getPendingAlertFilters(db, userId);

    const SYSTEM_INSTRUCTIONS = getSystemPrompt(
      categories,
      messageHistory,
      pendingAlertFilters || undefined
    );

    const intent = await processUserMessage(SYSTEM_INSTRUCTIONS, userMessage);

    console.log('Processed intent:', JSON.stringify(intent));

    await saveMessage(db, {
      userId,
      chatId,
      text: userMessage,
      intentType: intent.type,
    });

    if (await shouldBlockUser(db, userId)) {
      await blockUser(db, userId, 24);
      return [
        {
          text: '⚠️ Detetámos que enviaste várias mensagens irrelevantes. Estás bloqueado temporariamente por 24 horas.',
        },
      ];
    }

    switch (intent.type) {
      case IntentType.IRRELEVANT:
        await clearPendingAlertFilters(db, userId);
        return [{ text: intent.responseMessage }];

      case IntentType.DELETE_ALERT: {
        const deletedCount = await deleteUserAlerts(db, userId, intent.deleteAlertData);

        if (deletedCount === 0) {
          return [{ text: 'Não encontrei alertas com esses critérios para apagar. 🤷' }];
        }

        return [{ text: `✅ ${deletedCount} alerta(s) apagado(s) com sucesso!` }];
      }

      case IntentType.ALERT: {
        if (!intent.alertData) {
          return [{ text: 'Não consegui perceber os critérios do alerta. Podes reformular? 🤔' }];
        }

        await createAlert(db, {
          userId,
          chatId,
          searchQuery: intent.filters?.searchQuery || '',
          categories: intent.alertData.criteria.categories,
          keywordGroups: intent.alertData.criteria.keywordGroups,
          maxPrice: intent.alertData.criteria.maxPrice,
          minDiscount: intent.alertData.criteria.minDiscountPercent,
        });
        
        await clearPendingAlertFilters(db, userId);

        const newProducts = await searchAndFilterProducts(
          db,
          userId,
          intent.filters?.searchQuery || '',
          intent.filters || {}
        );

        if (newProducts.length > 0) {
          
          const successMessage = {
            text: `✅ Alerta criado com sucesso!\n\nEncontrei ${newProducts.length} produto(s) que já correspondem aos teus critérios:`,
          };
          
          return [successMessage, ...formatProductsForUser(newProducts)];
        } else {
          return [
            {
              text: `✅ Alerta criado com sucesso!\n\nVou notificar-te quando encontrar produtos que correspondam a: "${intent.filters?.searchQuery || 'os teus critérios'}" 🔔`,
            },
          ];
        }
      }

      case IntentType.SEARCH: {
        if (!intent.filters) intent.filters = {};

        const newProducts = await searchAndFilterProducts(
          db,
          userId,
          intent.filters.searchQuery || '',
          intent.filters
        );

        if (newProducts.length > 0) {
          await clearPendingAlertFilters(db, userId);
          return formatProductsForUser(newProducts);
        } else {
          await setPendingAlertFilters(db, userId, {
            searchQuery: intent.filters.searchQuery || '',
            categories: intent.filters.categories,
            keywordGroups: intent.filters.keywordGroups,
            minPrice: intent.filters.minPrice,
            maxPrice: intent.filters.maxPrice,
            minDiscount: intent.filters.minDiscount,
          });

          return [
            {
              text: `😔 Não encontrei produtos com esses critérios.\n\nQueres que crie um alerta para te notificar quando aparecerem produtos relacionados com "${intent.filters.searchQuery}"?`,
            },
          ];
        }
      }
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return [{ text: 'Desculpa, não consegui processar a tua mensagem. Podes reformular? 🤔' }];
  } finally {
    await closeConnection();
  }

  return [{ text: 'Ops, algo inesperado aconteceu. Tenta novamente mais tarde! 🚧' }];
};
