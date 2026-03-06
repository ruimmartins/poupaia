import { Product } from '@poupaia/db';
import { BrowsingResponse } from '@poupaia/ai';
import { TelegramMessage } from './types/telegram-message';

// Função de escape robusta para MarkdownV2
export const escapeMarkdownV2 = (text: string | number): string => {
  return text.toString().replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
};

export const sendTelegramMessage = async (chat_id: string | number, text: string) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: text, // O texto já vem formatado e escapado do formatProductsForUser
        parse_mode: 'MarkdownV2',
      }),
    });
    const data = await response.json();
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!data.ok) throw new Error(`Telegram API error: ${data.description} with text: ${text}`);
    return data;
  } catch (error) {
    throw error;
  }
};

export const sendTelegramPhoto = async (chat_id: string | number, photoUrl: string, caption: string) => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        photo: photoUrl,
        caption: caption, // A legenda já vem escapada corretamente
        parse_mode: 'MarkdownV2',
      }),
    });
    const data = await response.json();
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!data.ok) throw new Error(`Telegram API error: ${data.description} with caption: ${caption}`);
    return data;
  } catch (error) {
    throw error;
  }
};

export const formatProductsForUser = (products: Product[]): TelegramMessage[] => {
  const messages: TelegramMessage[] = [];

  for (const product of products) {
    const currentPrice = typeof product.currentPrice === 'string' ? parseFloat(product.currentPrice) : (product.currentPrice ?? 0);
    const originalPrice = typeof product.originalPrice === 'string' ? parseFloat(product.originalPrice) : (product.originalPrice ?? 0);

    let discount = product.discountPercentage;
    if (discount === null && originalPrice && currentPrice < originalPrice) {
      discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    const emoji = discount >= 60 ? '🔥' : discount >= 40 ? '⚡' : '💰';

    const safeTitle = escapeMarkdownV2(product.title);
    const safeOldPrice = escapeMarkdownV2(originalPrice.toFixed(2));
    const safeNewPrice = escapeMarkdownV2(currentPrice.toFixed(2));
    const safeDiscount = discount ? escapeMarkdownV2(discount.toString()) : '';

    let message = `${emoji} *${safeTitle}*\n\n`;

    if (discount && originalPrice) {
      message += `antes: ~${safeOldPrice}€~ \n*🔥 AGORA: ${safeNewPrice}€* \\(\\-${safeDiscount}%\\) 🔥\n`;
    }

    if (product.expiresAt) {
      const hoursLeft = Math.floor((new Date(product.expiresAt).getTime() - new Date().getTime()) / (1000 * 60 * 60));
      if (hoursLeft < 24) {
        message += `⏰ Expira em *${escapeMarkdownV2(hoursLeft)}h*\n`;
      }
    }

    // A URL do link não deve ser escapada pela função global, apenas caracteres que quebrem o MD (raro em URLs Amazon)
    message += `\n🛒 [Compra aqui](${product.url}?tag=ruimmartins-20)\n\n`;

    messages.push({
      text: message,
      imageUrl: product.imageUrl,
    });
  }

  return messages;
};

export const formatMoreInfoMessage = (product: Product, intent: BrowsingResponse['intent']): TelegramMessage => {
  let message = '';

  return {
    text: message,
    imageUrl: product.imageUrl,
  };
};
