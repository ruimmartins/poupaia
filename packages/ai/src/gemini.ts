import { connectToDatabase, getAllCategories, Product, ProductFilters } from '@poupaia/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSystemPrompt } from './system-prompt';

interface GeminiResponse {
  isRelevant: boolean;
  messageType?: 'alert' | 'search' | 'delete_alert';
  filters?: any;
  alertFrequency?: 'once' | 'always';
  userMessage?: string;
}

export interface ProcessedMessage {
  type: 'irrelevant' | 'alert' | 'search' | 'delete_alert';
  filters?: ProductFilters;
  alertData?: {
    frequency: 'once' | 'always';
    criteria: {
      categories?: string[];
      keywordGroups?: string[][];
      maxPrice?: number;
      minDiscountPercent?: number;
    };
  };
  deleteAlertData?: {
    categories?: string[];
    keywordGroups?: string[][];
  };
  responseMessage: string;
}

export interface ProductMessage {
  text: string;
  imageUrl?: string;
}

/**
 * Processa mensagem do utilizador e identifica tipo + extrai filtros
 */
export async function processUserMessage(systemInstruction: string, userMessage: string): Promise<ProcessedMessage> {
  try {

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    /* const url: string = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    const response = await fetch(url)

    console.log(await response.json()) */

    const model = genAI.getGenerativeModel({
      model: 'gemini-flash-latest',
      systemInstruction,
    });

    const result = await model.generateContent(userMessage);
    const response = result.response;
    const text = response.text();

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Formato de resposta inválido do Gemini');
    }

    const parsed: GeminiResponse = JSON.parse(jsonMatch[0]);

    // Se não for relevante para compras
    if (!parsed.isRelevant || !parsed.messageType) {
      return {
        type: 'irrelevant',
        responseMessage: 'Desculpa, só posso ajudar-te a encontrar produtos e ofertas! 🛍️'
      };
    }

    // Validar que parsed.filters existe
    if (!parsed.filters) {
      parsed.filters = {};
    }

    // Construir filtros
    const filters: ProductFilters = {
      notExpired: true,
      limit: parsed.messageType === 'search' ? 10 : undefined,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...parsed.filters,
    };

    if (parsed.messageType === 'alert') {
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
        type: 'alert',
        filters,
        alertData,
        responseMessage: parsed.userMessage || '✅ Alerta criado! Vou avisar-te quando encontrar algo.'
      };
    }

    // Se for ELIMINAR ALERTA
    if (parsed.messageType === 'delete_alert') {
      const deleteAlertData = {
        categories: parsed.filters?.categories || [],
        keywordGroups: parsed.filters?.keywordGroups,
      };

      return {
        type: 'delete_alert',
        deleteAlertData,
        responseMessage: parsed.userMessage || '✅ Alerta removido!'
      };
    }

    // Se for uma PESQUISA
    return {
      type: 'search',
      filters,
      responseMessage: parsed.userMessage || 'A procurar produtos... 🔍'
    };

  } catch (error) {
    console.error('Erro ao processar mensagem com Gemini:', error);
    
    // Fallback: assume pesquisa
    return {
      type: 'search',
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

/**
 * Formata produtos para enviar ao utilizador
 * Retorna um array de mensagens, uma por produto (máximo 5)
 */
export function formatProductsForUser(products: Product[]): ProductMessage[] {
  if (products.length === 0) {
    return [{
      text: '😔 Não encontrei produtos com esses critérios. Tenta ser menos específico!'
    }];
  }

  const messages: ProductMessage[] = [];
  
  // Mensagem inicial
  messages.push({
    text: `🎉 Encontrei ${products.length} produto(s) para ti!`
  });

  // Limitar a 5 produtos
  const productsToShow = products.slice(0, 5);
  
  for (const product of productsToShow) {
    // Garantir que preços são números
    const currentPrice = typeof product.currentPrice === 'string' 
      ? parseFloat(product.currentPrice) 
      : product.currentPrice ?? 0;
    
    const originalPrice = typeof product.originalPrice === 'string' 
      ? parseFloat(product.originalPrice) 
      : product.originalPrice ?? 0;
    
    // Calcular desconto se não existir
    let discount = product.discountPercentage;
    if (discount === null && originalPrice && currentPrice < originalPrice) {
      discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }
    
    const emoji = discount >= 60 ? '🔥' : discount >= 40 ? '⚡' : '💰';
    
    let message = `${emoji} **${product.title}**\n\n`;
    
    // Formatar preço com desconto
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
  
  // Mensagem final se houver mais produtos
  if (products.length > 5) {
    messages.push({
      text: `... e mais ${products.length - 5} produto(s)! Refina a tua pesquisa para ver mais.`
    });
  }

  return messages;
}
