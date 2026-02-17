import { chromium, Page } from 'playwright';
import { Product } from '@poupaia/db';

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

  // Validar estrutura básica
  if (!data?.entity?.rankedPromotions || !Array.isArray(data.entity.rankedPromotions)) {
    console.warn('Invalid data structure: missing entity or rankedPromotions');
    return result;
  }

  for (const product of data.entity.rankedPromotions) {
    try {
      // Validar estrutura do produto
      if (!product?.product?.entity) {
        console.warn('Skipping product: missing product.entity');
        continue;
      }

      const productEntity = product.product.entity;
      const buyingOption = productEntity.buyingOptions?.[0];
      
      if (!buyingOption) {
        console.warn('Skipping product: no buying options available');
        continue;
      }

      const originalPrice =
        buyingOption.price?.entity?.basisPrice?.moneyValueOrRange?.value?.amount;
      const currentPrice =
        buyingOption.price?.entity?.priceToPay?.moneyValueOrRange?.value?.amount;
      
      // Validar preços obrigatórios
      if (!currentPrice || currentPrice <= 0) {
        console.warn('Skipping product: invalid current price');
        continue;
      }

      const discountPercentage = 
        originalPrice && currentPrice && originalPrice > 0
          ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
          : 0;

      // Validar campos obrigatórios
      const asin = productEntity.asin;
      const title = productEntity.title?.entity?.displayString;
      const imageId = productEntity.productImages?.entity?.images?.[0]?.lowRes?.physicalId;

      if (!asin || !title) {
        console.warn('Skipping product: missing asin or title');
        continue;
      }

      result.push({
        id: `AMAZON_${asin}`,
        imageUrl: imageId 
          ? `https://m.media-amazon.com/images/I/${imageId}._AC_SF226,226_QL85_.jpg`
          : 'https://via.placeholder.com/226',
        title,
        originalPrice: originalPrice || currentPrice,
        currentPrice,
        currency: "€",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: `https://www.amazon.es/-/pt/dp/${asin}`,
        expiresAt: buyingOption.dealDetails?.entity?.endTime || null,
        discountPercentage,
        category: currentCategory,
        status: 'pending',
        postCount: 0,
      });
    } catch (error: any) {
      console.warn('Error parsing product:', error.message);
      // Continua para o próximo produto sem quebrar o loop
      continue;
    }
  }

  return result;
};

export const scrapAmazon = async () => {
  let browser;
  
  try {
    // 1. Scraping com Playwright (Evita bloqueios básicos)
    browser = await chromium.launch({ headless: true });

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
        try {
          const data = await response.json();
          const results = parseProductData(data, currentCategory);
          products.push(...results);
        } catch (error: any) {
          console.warn(`Failed to parse response from ${response.url()}:`, error.message);
        }
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
      try {
        const text = await bubble.innerText();
        if (!discountsToFilter.includes(text)) {
          discountBubbles.push(bubble);
        }
      } catch (error: any) {
        console.warn('Failed to get bubble text:', error.message);
      }
    }

    for (const bubble of discountBubbles) {
      try {
        currentCategory = await bubble.innerText();
        await bubble.scrollIntoViewIfNeeded()
        await bubble.click()
        await autoScroll(page, 10, 500);
      } catch (error: any) {
        console.warn(`Failed to process category bubble:`, error.message);
        // Continua para a próxima categoria
      }
    }

    await browser.close();

    const uniqueProducts = Array.from(
      new Map(products.map(product => [product.id, product])).values()
    );

    console.log(`✅ Successfully scraped ${uniqueProducts.length} unique products`);
    return uniqueProducts;
    
  } catch (error: any) {
    console.error('Fatal error during scraping:', error);
    
    // Garantir que o browser é fechado mesmo em caso de erro
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Failed to close browser:', closeError);
      }
    }
    
    // Retornar array vazio em caso de erro fatal
    return [];
  }
};
