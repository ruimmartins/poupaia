import { GoogleGenAI } from '@google/genai';
import { Contents } from './types/gemini-types';

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
