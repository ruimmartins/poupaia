import { chromium, Locator, Page } from 'playwright';
import { Product } from '@poupaia/db';

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;

const IS_CI = process.env.CI === 'true';
const WAIT_FOR_CLICK_TIMEOUT = IS_CI ? 200 : 300;
const WAIT_FOR_SELECTOR_TIMEOUT = IS_CI ? 4000 : 2500;
const WAIT_FOR_NAVIGATION_TIMEOUT = IS_CI ? 6000 : 4000;
const WAIT_FOR_NETWORK_IDLE_TIMEOUT = IS_CI ? 7500 : 5000;

const randomTimeout = (value: number) => (Math.random() + 0.5) * value;

function getRandomUserAgent() {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

const clickLikeHuman = async (element: Locator) => {
  await new Promise(resolve => setTimeout(resolve, randomTimeout(WAIT_FOR_CLICK_TIMEOUT)));
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
};

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
      const currentPrice = buyingOption.price?.entity?.priceToPay?.moneyValueOrRange?.value?.amount;

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
        brandLevel: 0,
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

export const scrapAmazon = async (taskIndex: number = 0, totalTasks: number = 1) => {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: 'pt-PT',
      timezoneId: 'Europe/Lisbon',
      userAgent: getRandomUserAgent(),
    });

    const products: Product[] = [];
    const page = await context.newPage();

    const createResponseListener = (category: string, subcategory: string) => {
      return async (response: any) => {
        if (PROMOTIONS_REGEX.test(response.url())) {
          try {
            const status = response.status();
            if (status === 204 || status >= 300) {
              console.log(`Received status ${status} for ${response.url()}, skipping...`);
              return;
            }

            const contentType = response.headers()['content-type'];
            if (!contentType.toLowerCase().includes('json')) {
              console.log(
                `Unexpected content type ${contentType} for ${response.url()}, skipping...`
              );
              return;
            }

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

    const seeMoreButton = departmentsContainer.locator('div:first-child a', {
      hasText: 'Ver mais',
    });
    await seeMoreButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await clickLikeHuman(seeMoreButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const mainDepartmentsLocator = departmentsContainer.locator(
      'div:first-child [role="radiogroup"] [data-testid^="filter-departments-"]'
    );
    await mainDepartmentsLocator
      .first()
      .waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    const allMainDepartments = (await mainDepartmentsLocator.all()).slice(0, -1);

    // Dividir categorias entre tasks
    const mainDepartments = allMainDepartments
      .slice(1)
      .filter((_, index) => index % totalTasks === taskIndex);
    
    if(process.env.DEVELOPMENT_MODE === 'true') {
      mainDepartments.splice(1); // Para desenvolvimento, limitar a 1 categoria principal (além de "Todas as categorias")
    }

    for (const filter of mainDepartments) {
      const categoryName = await filter.innerText();
      await clickLikeHuman(filter);
      await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });

      await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

      const subDepartmentsLocator = departmentsContainer.locator(
        'div:nth-child(2) [role="radiogroup"] [data-testid^="filter-departments-"]'
      );
      await subDepartmentsLocator
        .first()
        .waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
      const subDepartments = await subDepartmentsLocator.all();

      for (const subFilter of subDepartments.slice(1)) {
        const subcategoryName = await subFilter.innerText();

        const responseListener = createResponseListener(categoryName, subcategoryName);
        page.on('response', responseListener);

        await clickLikeHuman(subFilter);
        await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
        await autoScroll(page, 10, 500);
        await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

        page.off('response', responseListener);

        const categoryButton = departmentsContainer
          .getByRole('button', { name: categoryName, exact: true })
          .first();
        await categoryButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
        await clickLikeHuman(categoryButton);
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
      }

      try {
        const breadcrumbButton = departmentsContainer
          .getByTestId('breadcrumb')
          .getByRole('button')
          .first();
        await breadcrumbButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
        await clickLikeHuman(breadcrumbButton);
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
      } catch (e) {
        const allDepartmentsButton = page.locator('[data-testid="filter-departments-all"]');
        await allDepartmentsButton.waitFor({
          state: 'visible',
          timeout: WAIT_FOR_SELECTOR_TIMEOUT,
        });
        await clickLikeHuman(allDepartmentsButton);
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
      }
    }

    await browser.close();

    const uniqueProducts = Array.from(
      new Map(products.map(product => [product.id, product])).values()
    );

    return uniqueProducts;
  } catch (error: any) {
    console.error(`[Task ${taskIndex}] Fatal error during scraping:`, error);

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
