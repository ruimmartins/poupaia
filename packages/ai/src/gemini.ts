import { Product, ProductFilters } from '@poupaia/db';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIResponse, IntentType, ProcessedMessage, ProductMessage } from './types';

export const processUserMessage = async (systemInstruction: string, userMessage: string): Promise<ProcessedMessage> => {
  try {

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
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
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...parsed.filters,
    };

    return {
      type: parsed.messageType,
      filters,
      responseMessage: parsed.userMessage
    }

  } catch (error) {
    console.error('Erro ao processar mensagem com Gemini:', error);
    
    return {
      type: IntentType.SEARCH,
      filters: {
        limit: 10,
        sortBy: 'discountPercentage',
        sortOrder: 'desc'
      },
      responseMessage: 'A mostrar-te as melhores ofertas disponíveis! 🎯'
    };
  } 
}
