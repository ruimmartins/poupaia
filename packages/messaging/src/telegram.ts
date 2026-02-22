import { Product } from '@poupaia/db';
import { ProductMessage } from '@poupaia/ai';

export const sendTelegramMessage = async (chatId: string, text: string) => {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    }),
  });
};

export const sendTelegramPhoto = async (chatId: string, photoUrl: string, caption?: string) => {
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: 'MarkdownV2',
    }),
  });
};

export const formatProductsForUser = (products: Product[]): ProductMessage[] => {
  if (products.length === 0) {
    return [
      {
        text: '😔 Não encontrei produtos com esses critérios. Tenta ser menos específico!',
      },
    ];
  }

  const messages: ProductMessage[] = [];

  messages.push({
    text: `🎉 Encontrei ${products.length} produto(s) para ti!`,
  });

  for (const product of products) {
    const currentPrice =
      typeof product.currentPrice === 'string'
        ? parseFloat(product.currentPrice)
        : (product.currentPrice ?? 0);

    const originalPrice =
      typeof product.originalPrice === 'string'
        ? parseFloat(product.originalPrice)
        : (product.originalPrice ?? 0);

    let discount = product.discountPercentage;
    if (discount === null && originalPrice && currentPrice < originalPrice) {
      discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    const emoji = discount >= 60 ? '🔥' : discount >= 40 ? '⚡' : '💰';

    let message = `${emoji} *${product.title}*\n\n`;

    if (discount && originalPrice) {
      message += `antes: ~${originalPrice.toFixed(2)}€~ \n **🔥AGORA: ${currentPrice.toFixed(2)}€** (-${discount}%) 🔥\n`;
    }

    if (product.expiresAt) {
      const expiryDate = new Date(product.expiresAt);
      const now = new Date();
      const hoursLeft = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60));

      if (hoursLeft < 24) {
        message += `⏰ Expira em *${hoursLeft}h*\n`;
      }
    }

    message += `\n🛒 [Compra aqui](${product.url}?tag=ruimmartins-20)`;

    messages.push({
      text: message,
      imageUrl: product.imageUrl,
    });
  }

  return messages;
};
