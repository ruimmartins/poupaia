import { chromium, Page } from 'playwright';
import { Product } from '../mongodb/models/products';
/* import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config(); */

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;

async function autoScroll(page: Page, times: number = 5, intervalMs: number = 1000) {
  for (let i = 0; i < times; i++) {
		const amountPxScrolled = Math.random() * 300 + 200; // Rola entre 200 e 500 pixels
    await page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, amountPxScrolled);

		const randomDelay = intervalMs + Math.random() * 500; // Adiciona um atraso aleatório entre 0 e 500ms

    await page.waitForTimeout(randomDelay);
  }
}

const parseProductData = (data: any, currentCategory: string): Product[] => {
  const result: Product[] = [];

  for (const product of data.entity.rankedPromotions) {
    result.push({
      id: `AMAZON_${product.product.entity.asin}`,
      imageUrl: `https://m.media-amazon.com/images/I/${product.product.entity.productImages.entity.images[0].lowRes.physicalId}._AC_SF226,226_QL85_.jpg`,
      title: product.product.entity.title.entity.displayString,
      originalPrice:
        product.product.entity.buyingOptions[0]?.price.entity.basisPrice?.moneyValueOrRange.value
          .amount,
      currentPrice:
        product.product.entity.buyingOptions[0]?.price.entity.priceToPay?.moneyValueOrRange.value
          .amount,
      currency: "€",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      url: `https://www.amazon.es/dp/${product.product.entity.asin}`,
      expiresAt: product.product.entity.buyingOptions[0]?.dealDetails?.entity?.endTime,
      discountPercentage: product.product.entity.buyingOptions[0]?.price.entity.discount?.percentage,
      category: currentCategory,
      status: 'pending',
      postCount: 0,
    });
  }

  return result;
};

export const scrapAmazon = async () => {
  // 1. Scraping com Playwright (Evita bloqueios básicos)
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }, // Janela grande para carregar mais produtos
    deviceScaleFactor: 1,
  });

  let currentCategory = ''

  const products: Product[] = [];
  const page = await context.newPage();

  page.on('response', async response => {
    if (PROMOTIONS_REGEX.test(response.url())) {
      const data = await response.json();
      const results = parseProductData(data, currentCategory);
      products.push(...results);
    }
  });

  await page.goto('https://www.amazon.es/deals?language=pt_PT', {
    waitUntil: 'domcontentloaded', // Muito mais rápido e menos propenso a timeouts
    timeout: 60000, // Aumenta para 60 segundos por segurança
  });

  const discountsToFilter = ["Cupões", "Produtos usados de qualidade"]

  const allBubbles = await page.locator('[role="listitem"][id^="discount-bubble"]').all();
  
  const discountBubbles = [];
  for (const bubble of allBubbles) {
    const text = await bubble.innerText();
    if (!discountsToFilter.includes(text)) {
      discountBubbles.push(bubble);
    }
  }

  for (const bubble of discountBubbles) {
    currentCategory = await bubble.innerText();
    await bubble.scrollIntoViewIfNeeded()
    await bubble.click()
    await autoScroll(page, 10, 500);
  }

  await browser.close();

  const uniqueProducts = Array.from(
    new Map(products.map(product => [product.id, product])).values()
  );

  return uniqueProducts;
};
