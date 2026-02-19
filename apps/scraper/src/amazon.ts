import { chromium, Locator, Page } from 'playwright';
import { Product } from '@poupaia/db';

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;

const randomTimeout = (value: number) => (Math.random() + 0.5) * value;

const clickWithRandomDelay = async (element: Locator, baseDelay: number = 1000) => {
  await element.click();
  await new Promise(resolve => setTimeout(resolve, baseDelay + randomTimeout(baseDelay)));
}

const autoScroll = async (page: Page, times: number = 5, intervalMs: number = 1000) => {
  for (let i = 0; i < times; i++) {
    const amountPxScrolled = Math.random() * 300 + 200;
    await page.evaluate(amount => {
      window.scrollBy(0, amount);
    }, amountPxScrolled);

    await page.waitForTimeout(randomTimeout(intervalMs));

    const reachedBottom = await page.evaluate(
      () => window.scrollY + window.innerHeight >= document.body.scrollHeight
    );

    if (reachedBottom) break;
  }
}

const parseProductData = (data: any, currentCategory: string): Product[] => {
  const result: Product[] = [];

  if (!data?.entity?.rankedPromotions || !Array.isArray(data.entity.rankedPromotions)) {
    return result;
  }

  for (const product of data.entity.rankedPromotions) {
    try {
      if (!product?.product?.entity) {
        continue;
      }

      const productEntity = product.product.entity;
      const buyingOption = productEntity.buyingOptions?.[0];
      
      if (!buyingOption) {
        continue;
      }

      const originalPrice =
        buyingOption.price?.entity?.basisPrice?.moneyValueOrRange?.value?.amount;
      const currentPrice =
        buyingOption.price?.entity?.priceToPay?.moneyValueOrRange?.value?.amount;

      if (!currentPrice || currentPrice <= 0) {
        continue;
      }

      const discountPercentage =
        originalPrice && currentPrice && originalPrice > 0
          ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
          : 0;

      if (discountPercentage < 10) {
        continue;
      }

      const asin = productEntity.asin;
      const title = productEntity.title?.entity?.displayString;
      const brand = productEntity.brandLogo?.entity?.logo?.entity?.altText;
      const imageId = productEntity.productImages?.entity?.images?.[0]?.lowRes?.physicalId;

      if (!asin || !title) {
        continue;
      }

      result.push({
        id: `AMAZON_${asin}`,
        imageUrl: imageId 
          ? `https://m.media-amazon.com/images/I/${imageId}._AC_SF226,226_QL85_.jpg`
          : 'https://via.placeholder.com/226',
        title,
        brand,
        originalPrice: originalPrice || currentPrice,
        currentPrice,
        currency: '€',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: `https://www.amazon.es/-/pt/dp/${asin}`,
        expiresAt: buyingOption.dealDetails?.entity?.endTime || null,
        discountPercentage,
        category: currentCategory,
      });
    } catch (error: any) {
      console.warn('Error parsing product:', error.message);
      continue;
    }
  }

  return result;
};

export const scrapAmazon = async () => {
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });

    let currentCategory: string | null = null;
    let currentSubcategory: string | null = null;

    const products: Product[] = [];
    const page = await context.newPage();

    page.on('response', async response => {
      if (PROMOTIONS_REGEX.test(response.url()) && currentCategory && currentSubcategory) {
        try {
          const data = await response.json();
          const results = parseProductData(data, `${currentCategory} > ${currentSubcategory}`);
          products.push(...results);
        } catch (error: any) {
          console.warn(`Failed to parse response from ${response.url()}:`, error.message);
        }
      }
    });

    await page.goto('https://www.amazon.es/deals?language=pt_PT', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const departmentsContainer = page.locator('[data-tabulation-id="desktop-refinements"]');

    await departmentsContainer.locator('div:first-child a', { hasText: 'Ver mais' }).click();
    await page.waitForTimeout(randomTimeout(1000));

    const mainDepartments = (
      await departmentsContainer
        .locator('div:first-child [role="radiogroup"] [data-testid^="filter-departments-"]')
        .all()
    ).slice(0, -1);

    for (const filter of mainDepartments.slice(1)) {
      currentCategory = await filter.innerText();
      await clickWithRandomDelay(filter);

      const subDepartments = await departmentsContainer
        .locator('div:nth-child(2) [role="radiogroup"] [data-testid^="filter-departments-"]')
        .all();

      for (const subFilter of subDepartments.slice(1)) {
        currentSubcategory = await subFilter.innerText();
        await clickWithRandomDelay(subFilter);
        await autoScroll(page, 10, 500);
        await clickWithRandomDelay(
          departmentsContainer.getByRole('button', { name: currentCategory, exact: true }).first()
        );
      }

      try {
        await clickWithRandomDelay(
          departmentsContainer.getByTestId('breadcrumb').getByRole('button').first()
        );
      } catch (e) {
        await clickWithRandomDelay(page.locator('[data-testid="filter-departments-all"]'));
      }

      currentSubcategory = null;
    }

    await browser.close();

    const uniqueProducts = Array.from(
      new Map(products.map(product => [product.id, product])).values()
    );

    console.log(`✅ Successfully scraped ${uniqueProducts.length} unique products`);
    return uniqueProducts;
  } catch (error: any) {
    console.error('Fatal error during scraping:', error);

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Failed to close browser:', closeError);
      }
    }

    return [];
  }
};
