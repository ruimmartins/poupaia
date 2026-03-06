import { GoogleGenerativeAI } from '@google/generative-ai';

export const processUserMessage = async <T>(systemInstruction: string, userMessage: string): Promise<T> => {
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

    const parsed: T = JSON.parse(jsonMatch[0]);

    return parsed;
  } catch (error) {
    console.error('Erro ao processar mensagem com Gemini:', error);

    return { error: true, message: (error as Error).message } as T;
  }
};
