import { ContentEmbedding, GoogleGenAI } from '@google/genai';
import { Contents } from './types/gemini-types';
import { Product } from '@poupaia/db';

const EMBEDDING_DIMENSION = 768;

export const processUserMessage = async <T>(systemInstruction: string, contents: Contents[]): Promise<T> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

    const contentParts = contents.map(c => ({ role: c.role, parts: [{ text: c.content }] }));

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: contentParts,
      config: {
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        temperature: 0.2,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    });

    const text = response.text;

    const jsonMatch = (text ?? '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Formato de resposta inválido do Gemini');
    }

    const parsed: T = JSON.parse(jsonMatch[0]);

    return parsed;
  } catch (error) {
    console.error('Erro ao processar mensagem com Gemini:', error);

    return { error: true, message: (error as Error).message } as T;
  }
};

export const generateEmbedding = async (contents: string[]): Promise<ContentEmbedding[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

    const response = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents,
      config: {
        outputDimensionality: EMBEDDING_DIMENSION,
      },
    });

    return response.embeddings || [];
  } catch (error) {
    console.error('Erro ao gerar embedding com Gemini:', error);
    return [];
  }
};
