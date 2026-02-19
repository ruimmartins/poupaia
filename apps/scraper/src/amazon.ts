import { chromium, Locator, Page } from 'playwright';
import { Product } from '@poupaia/db';

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;

const randomTimeout = (value: number) => (Math.random() + 0.5) * value;

const clickLikeHuman = async (element: Locator) => {
  await new Promise(resolve => setTimeout(resolve, randomTimeout(300)));
  await element.click();
};

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

    const products: Product[] = [];
    const page = await context.newPage();

    const createResponseListener = (category: string, subcategory: string) => {
      return async (response: any) => {
        if (PROMOTIONS_REGEX.test(response.url())) {
          try {
            const data = await response.json();
            const results = parseProductData(data, `${category} > ${subcategory}`);
            products.push(...results);
          } catch (error: any) {
            console.warn(`Failed to parse response from ${response.url()}:`, error.message);
          }
        }
      };
    };

    await page.goto('https://www.amazon.es/deals?language=pt_PT', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const departmentsContainer = page.locator('[data-tabulation-id="desktop-refinements"]');

    const seeMoreButton = departmentsContainer.locator('div:first-child a', { hasText: 'Ver mais' });
    await seeMoreButton.waitFor({ state: 'visible', timeout: 5000 });
    await clickLikeHuman(seeMoreButton);
    await page.waitForTimeout(randomTimeout(800));

    const mainDepartmentsLocator = departmentsContainer
      .locator('div:first-child [role="radiogroup"] [data-testid^="filter-departments-"]');
    await mainDepartmentsLocator.first().waitFor({ state: 'visible', timeout: 3000 });
    const mainDepartments = (await mainDepartmentsLocator.all()).slice(0, -1);

    for (const filter of mainDepartments.slice(1)) {
      const categoryName = await filter.innerText();
      await clickLikeHuman(filter);
      await page.waitForLoadState('networkidle', { timeout: 7000 });

      const subDepartmentsLocator = departmentsContainer
        .locator('div:nth-child(2) [role="radiogroup"] [data-testid^="filter-departments-"]');
      await subDepartmentsLocator.first().waitFor({ state: 'visible', timeout: 3000 });
      const subDepartments = await subDepartmentsLocator.all();

      for (const subFilter of subDepartments.slice(1)) {
        const subcategoryName = await subFilter.innerText();
        
        const responseListener = createResponseListener(categoryName, subcategoryName);
        page.on('response', responseListener);
        
        await clickLikeHuman(subFilter);
        await page.waitForLoadState('networkidle', { timeout: 7000 });
        await autoScroll(page, 10, 500);
        await page.waitForLoadState('networkidle', { timeout: 7000 });
        
        page.off('response', responseListener);
        
        const categoryButton = departmentsContainer.getByRole('button', { name: categoryName, exact: true }).first();
        await categoryButton.waitFor({ state: 'visible', timeout: 3000 });
        await clickLikeHuman(categoryButton);
      }

      try {
        const breadcrumbButton = departmentsContainer.getByTestId('breadcrumb').getByRole('button').first();
        await breadcrumbButton.waitFor({ state: 'visible', timeout: 3000 });
        await clickLikeHuman(breadcrumbButton);
      } catch (e) {
        const allDepartmentsButton = page.locator('[data-testid="filter-departments-all"]');
        await allDepartmentsButton.waitFor({ state: 'visible', timeout: 3000 });
        await clickLikeHuman(allDepartmentsButton);
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
