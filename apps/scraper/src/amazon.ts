import { Product, brands } from '@poupaia/db';
import { getBrowser, autoScroll, clickLikeHuman, randomTimeout, WAIT_FOR_NAVIGATION_TIMEOUT, WAIT_FOR_NETWORK_IDLE_TIMEOUT, WAIT_FOR_SELECTOR_TIMEOUT } from '@poupaia/scraper';

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;

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

      const originalPrice = parseFloat(buyingOption.price?.entity?.basisPrice?.moneyValueOrRange?.value?.amount ?? '0');
      const currentPrice = parseFloat(buyingOption.price?.entity?.priceToPay?.moneyValueOrRange?.value?.amount ?? '0');

      if (!currentPrice || currentPrice <= 0) {
        continue;
      }

      const discountPercentage = originalPrice && currentPrice && originalPrice > 0 ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0;

      if (discountPercentage < 10) {
        continue;
      }

      const asin = productEntity.asin;
      const title = productEntity.title?.entity?.displayString;
      const brand = productEntity.brandLogo?.entity?.logo?.entity?.altText;
      const imageId = productEntity.productImages?.entity?.images?.[0]?.hiRes?.physicalId;

      if (!asin || !title) {
        continue;
      }

      result.push({
        id: `AMAZON_${asin}`,
        imageUrl: imageId ? `https://m.media-amazon.com/images/I/${imageId}._AC_SF226,226_QL85_.jpg` : 'https://via.placeholder.com/226',
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
  const { page, browser } = await getBrowser();

  try {
    const products: Product[] = [];

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
              console.log(`Unexpected content type ${contentType} for ${response.url()}, skipping...`);
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

    const cookieForm = page.locator('form[role="dialog"]');
    await cookieForm.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });

    const acceptButton = cookieForm
      .locator('span', {
        hasText: 'Aceitar',
      })
      .first();
    await acceptButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
    await clickLikeHuman(acceptButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const departmentsContainer = page.locator('[data-tabulation-id="desktop-refinements"]');

    const seeMoreButton = departmentsContainer.locator('div:first-child a', {
      hasText: 'Ver mais',
    });
    await seeMoreButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await clickLikeHuman(seeMoreButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const seeMoreBrandsButton = departmentsContainer.locator('div:nth-child(2) a', {
      hasText: 'Ver mais',
    });
    await seeMoreBrandsButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await clickLikeHuman(seeMoreBrandsButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const mainDepartmentsLocator = departmentsContainer.locator('div:first-child [role="radiogroup"] [data-testid^="filter-departments-"]');
    await mainDepartmentsLocator.first().waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    const allMainDepartments = (await mainDepartmentsLocator.all()).slice(0, -1);

    // Dividir categorias entre tasks
    const mainDepartments = allMainDepartments.slice(1);

    for (const filter of mainDepartments) {
      const categoryName = await filter.innerText();
      await clickLikeHuman(filter);
      await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });

      await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

      const subDepartmentsLocator = departmentsContainer.locator('div:nth-child(2) [role="radiogroup"] [data-testid^="filter-departments-"]');
      await subDepartmentsLocator.first().waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
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

        let checkboxesClicked = [];
        const brandsCheckbox = await departmentsContainer.locator('div[data-csa-c-element-id^="filter-brands"]').all();
        console.log(`Found ${brandsCheckbox.length} brand checkboxes for ${categoryName} > ${subcategoryName}`);

        for (const checkbox of brandsCheckbox) {
          const value = await checkbox.getAttribute('data-csa-c-element-id');
          if (value && brands.includes(value.replace('filter-brands-', ''))) {
            checkboxesClicked.push(checkbox);
            await clickLikeHuman(checkbox);
            await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });
            await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
          }
        }

        if (checkboxesClicked.length > 0) {
          await autoScroll(page, 10, 500);
          await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });
          await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
          for (const checkbox of checkboxesClicked) {
            await clickLikeHuman(checkbox);
            await page.waitForLoadState('networkidle', { timeout: WAIT_FOR_NETWORK_IDLE_TIMEOUT });
            await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
          }
        }

        page.off('response', responseListener);

        const categoryButton = departmentsContainer.getByRole('button', { name: categoryName, exact: true }).first();
        await categoryButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
        await clickLikeHuman(categoryButton);
        await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
      }

      try {
        const breadcrumbButton = departmentsContainer.getByTestId('breadcrumb').getByRole('button').first();
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

    const uniqueProducts = Array.from(new Map(products.map(product => [product.id, product])).values());

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
