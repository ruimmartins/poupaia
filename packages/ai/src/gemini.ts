import { Product, ProductFilters } from '@poupaia/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIResponse, IntentType, ProcessedMessage, ProductMessage } from './types';

export const processUserMessage = async (systemInstruction: string, userMessage: string): Promise<ProcessedMessage> => {
  try {

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction,
    });

    const result = await model.generateContent(userMessage);
    const response = result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Formato de resposta inválido do Gemini');
    }

    const parsed: AIResponse = JSON.parse(jsonMatch[0]);

    if (!parsed.isRelevant || !parsed.messageType) {
      return {
        type: IntentType.IRRELEVANT,
        responseMessage: 'Desculpa, só posso ajudar-te a encontrar produtos e ofertas! 🛍️'
      };
    }

    if (!parsed.filters) {
      parsed.filters = {};
    }

    const filters: ProductFilters = {
      notExpired: true,
      limit: parsed.messageType === IntentType.SEARCH ? 10 : undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...parsed.filters,
    };

    if (parsed.messageType === IntentType.ALERT) {
      const alertData = {
        frequency: parsed.alertFrequency || 'always',
        criteria: {
          categories: parsed.filters?.categories || [],
          keywordGroups: parsed.filters?.keywordGroups,
          maxPrice: parsed.filters?.maxPrice,
          minDiscountPercent: parsed.filters?.minDiscount,
        }
      };

      return {
        type: IntentType.ALERT,
        filters,
        alertData,
        responseMessage: parsed.userMessage || '✅ Alerta criado! Vou avisar-te quando encontrar algo.'
      };
    }

    if (parsed.messageType === IntentType.DELETE_ALERT) {
      const deleteAlertData = {
        categories: parsed.filters?.categories || [],
        keywordGroups: parsed.filters?.keywordGroups,
      };

      return {
        type: IntentType.DELETE_ALERT,
        deleteAlertData,
        responseMessage: parsed.userMessage || '✅ Alerta removido!'
      };
    }

    return {
      type: IntentType.SEARCH,
      filters,
      responseMessage: parsed.userMessage || 'A procurar produtos... 🔍'
    };

  } catch (error) {
    console.error('Erro ao processar mensagem com Gemini:', error);
    
    return {
      type: IntentType.SEARCH,
      filters: {
        onlyGoodDeals: true,
        notExpired: true,
        limit: 10,
        sortBy: 'dealScore',
        sortOrder: 'desc'
      },
      responseMessage: 'A mostrar-te as melhores ofertas disponíveis! 🎯'
    };
  } 
}

export const formatProductsForUser = (products: Product[]): ProductMessage[] => {
  if (products.length === 0) {
    return [{
      text: '😔 Não encontrei produtos com esses critérios. Tenta ser menos específico!'
    }];
  }

  const messages: ProductMessage[] = [];
  
  messages.push({
    text: `🎉 Encontrei ${products.length} produto(s) para ti!`
  });
  
  for (const product of products) {
    const currentPrice = typeof product.currentPrice === 'string' 
      ? parseFloat(product.currentPrice) 
      : product.currentPrice ?? 0;
    
    const originalPrice = typeof product.originalPrice === 'string' 
      ? parseFloat(product.originalPrice) 
      : product.originalPrice ?? 0;
    
    let discount = product.discountPercentage;
    if (discount === null && originalPrice && currentPrice < originalPrice) {
      discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }
    
    const emoji = discount >= 60 ? '🔥' : discount >= 40 ? '⚡' : '💰';
    
    let message = `${emoji} **${product.title}**\n\n`;
    
    if (discount && originalPrice) {
      message += `💶 ~~${originalPrice.toFixed(2)}€~~ → **${currentPrice.toFixed(2)}€** (-${discount}%)\n`;
    } else {
      message += `💶 **${currentPrice.toFixed(2)}€**\n`;
    }
    
    if (product.expiresAt) {
      const expiryDate = new Date(product.expiresAt);
      const now = new Date();
      const hoursLeft = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      if (hoursLeft < 24) {
        message += `⏰ Expira em ${hoursLeft}h\n`;
      }
    }
    
    message += `\n🛒 ${product.url}`;
    
    messages.push({
      text: message,
      imageUrl: product.imageUrl
    });
  }

  return messages;
}
