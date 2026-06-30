import { Product, brands, getParentCategory } from '@poupaia/db';
import { getBrowser, autoScroll, clickLikeHuman, randomTimeout, WAIT_FOR_NAVIGATION_TIMEOUT, WAIT_FOR_SELECTOR_TIMEOUT } from '@poupaia/scraper';

const PROMOTIONS_REGEX = /\/api\/marketplaces\/.*\/promotions/;
const CATEGORY_TIMEOUT_MS = 10 * 60 * 1000;

const waitAfterAction = async (page: any, ms: number) => {
  await page.waitForTimeout(randomTimeout(ms));
};

type DiscountLevel = 'fraco' | 'razoavel' | 'bom' | 'excelente';

const getDiscountLevel = (currentPrice: number, originalPrice: number): DiscountLevel | null => {
  if (originalPrice <= 0 || currentPrice >= originalPrice) return null;

  const savings = originalPrice - currentPrice;
  const discountPct = (savings / originalPrice) * 100;

  // Floor absoluto: nunca considerar deals abaixo de 5%
  if (discountPct < 5) return 'fraco';

  if (currentPrice <= 10) {
    if (discountPct >= 70) return 'excelente';
    if (discountPct >= 50) return 'bom';
    if (discountPct >= 30) return 'razoavel';
    return 'fraco';
  }

  if (currentPrice <= 50) {
    if (discountPct >= 50 || savings >= 20) return 'excelente';
    if (discountPct >= 35 || savings >= 10) return 'bom';
    if (discountPct >= 20 || savings >= 5) return 'razoavel';
    return 'fraco';
  }

  if (currentPrice <= 200) {
    if (discountPct >= 40 || savings >= 60) return 'excelente';
    if (discountPct >= 30 || savings >= 30) return 'bom';
    if (discountPct >= 15 || savings >= 15) return 'razoavel';
    return 'fraco';
  }

  if (currentPrice <= 500) {
    if (discountPct >= 40 || savings >= 150) return 'excelente';
    if (discountPct >= 30 || savings >= 80) return 'bom';
    if (discountPct >= 15 || savings >= 40) return 'razoavel';
    return 'fraco';
  }

  if (discountPct >= 35 || savings >= 300) return 'excelente';
  if (discountPct >= 25 || savings >= 150) return 'bom';
  if (discountPct >= 10 || savings >= 80) return 'razoavel';
  return 'fraco';
};

const parseProductData = (data: any, currentCategory: string, amazonTopLevel: string): Product[] => {
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

      const discountLevel = getDiscountLevel(currentPrice, originalPrice || currentPrice);
      if (!discountLevel || discountLevel === 'fraco') {
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
        originalPrice: originalPrice || currentPrice,
        currentPrice,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: `https://www.amazon.es/-/pt/dp/${asin}`,
        expiresAt: buyingOption.dealDetails?.entity?.endTime || null,
        discountPercentage,
        discountLevel,
        category: currentCategory,
        parentCategory: getParentCategory(amazonTopLevel),
      });
    } catch (error: any) {
      console.warn('Error parsing product:', error.message);
      continue;
    }
  }

  return result;
};

export type ScrapProgress = { categoryIndex: number; categoryTotal: number; categoryName: string };

export const scrapAmazon = async (taskIndex: number = 0, totalTasks: number = 1, onProgress?: (progress: ScrapProgress) => void) => {
  let { page, browser } = await getBrowser();

  const products: Product[] = [];

  let pageClosed = false;
  page.on('close', () => {
    pageClosed = true;
    console.log(`[Task ${taskIndex}] Page closed unexpectedly`);
  });
  page.on('crash', () => {
    pageClosed = true;
    console.log(`[Task ${taskIndex}] Page crashed`);
  });

  const recreateBrowser = async () => {
    try {
      await browser.close();
    } catch {}
    const newBrowser = await getBrowser();
    browser = newBrowser.browser;
    page = newBrowser.page;
    pageClosed = false;
    page.on('close', () => {
      pageClosed = true;
      console.log(`[Task ${taskIndex}] Page closed unexpectedly`);
    });
    page.on('crash', () => {
      pageClosed = true;
      console.log(`[Task ${taskIndex}] Page crashed`);
    });
  };

  const setupFilters = async () => {
    if (pageClosed) {
      console.log(`[Task ${taskIndex}] Page/browser is closed, recreating...`);
      await recreateBrowser();
    }
    await page.goto('https://www.amazon.es/deals?language=pt_PT', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Cookie dialog only appears on the first visit of the session
    try {
      const cookieForm = page.locator('form[role="dialog"]');
      await cookieForm.waitFor({ state: 'visible', timeout: 5000 });
      const acceptButton = cookieForm.locator('span', { hasText: 'Aceitar' }).first();
      await acceptButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
      await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
      await clickLikeHuman(acceptButton);
      await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
    } catch {
      // Dialog does not appear on reloads — safe to ignore
    }

    const departmentsContainer = page.locator('[data-tabulation-id="desktop-refinements"]');

    const seeMoreButton = departmentsContainer.locator('div:first-child a', { hasText: 'Ver mais' });
    await seeMoreButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await clickLikeHuman(seeMoreButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const seeMoreBrandsButton = departmentsContainer.locator('div:nth-child(2) a', { hasText: 'Ver mais' });
    await seeMoreBrandsButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    await clickLikeHuman(seeMoreBrandsButton);
    await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));

    const mainDepartmentsLocator = departmentsContainer.locator('[role="radiogroup"]').first().locator('[data-testid^="filter-departments-"]');
    await mainDepartmentsLocator.first().waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
    const allMainDepartments = (await mainDepartmentsLocator.all()).slice(0, -1);

    return { departmentsContainer, mainDepartments: allMainDepartments.slice(1) };
  };

  try {
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
            const results = parseProductData(data, `${category} > ${subcategory}`, category);
            products.push(...results);
          } catch (error: any) {
            console.warn(`Failed to parse response from ${response.url()}:`, error.message);
          }
        }
      };
    };

    // Dividir categorias entre tasks
    let { departmentsContainer, mainDepartments } = await setupFilters();

    const maxCategories = parseInt(process.env.MAX_CATEGORIES || '', 10) || 0;
    if (maxCategories > 0 && mainDepartments.length > maxCategories) {
      console.log(`[Task ${taskIndex}] MAX_CATEGORIES=${maxCategories}: limiting from ${mainDepartments.length} to ${maxCategories} categories`);
      mainDepartments = mainDepartments.slice(0, maxCategories);
    }

    for (let i = 0; i < mainDepartments.length; i++) {
      let responseListener: ((response: any) => Promise<void>) | null = null;

      try {
        await Promise.race([
          (async () => {
            const filter = mainDepartments[i];
            const categoryName = await filter.innerText();
            console.log(`[Task ${taskIndex}] Category ${i + 1}/${mainDepartments.length}: ${categoryName}`);
            onProgress?.({ categoryIndex: i + 1, categoryTotal: mainDepartments.length, categoryName });
            await clickLikeHuman(filter);
            await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT * 2);

            const subDepartmentsLocator = departmentsContainer.locator('[role="radiogroup"]').first().locator('[data-testid^="filter-departments-"]');
            await subDepartmentsLocator.first().waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
            const subDepartments = await subDepartmentsLocator.all();
            const subDeptsToProcess = subDepartments.slice(1);
            console.log(`[Task ${taskIndex}]   Subcategories: ${subDeptsToProcess.length}`);

            for (let sIdx = 0; sIdx < subDeptsToProcess.length; sIdx++) {
              const subFilter = subDeptsToProcess[sIdx];
              const subcategoryName = await subFilter.innerText();
              console.log(`[Task ${taskIndex}]   Sub ${sIdx + 1}/${subDeptsToProcess.length}: ${subcategoryName}`);

              responseListener = createResponseListener(categoryName, subcategoryName);
              page.on('response', responseListener);

              try {
                await clickLikeHuman(subFilter);
                await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT * 2);
                await autoScroll(page, 10, 500);
                await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT);

                const brandSetLower = brands.map(b => b.toLowerCase());
                const matchingBrandSlugs: string[] = await page.evaluate((brandSetArr: string[]) => {
                  const brandSet = new Set(brandSetArr);
                  const checkboxes = document.querySelectorAll('[data-tabulation-id="desktop-refinements"] div[data-csa-c-element-id^="filter-brands"]');
                  const result: string[] = [];
                  checkboxes.forEach((cb) => {
                    const value = cb.getAttribute('data-csa-c-element-id');
                    if (value) {
                      const brandName = value.replace('filter-brands-', '').toLowerCase();
                      if (brandSet.has(brandName)) {
                        result.push(value);
                      }
                    }
                  });
                  return result;
                }, brandSetLower);

                let checkboxesClicked: any[] = [];

                for (const slug of matchingBrandSlugs) {
                  const checkbox = departmentsContainer.locator(`div[data-csa-c-element-id="${slug}"]`);
                  console.log(`[Task ${taskIndex}]     Brand filter: ${slug.replace('filter-brands-', '')}`);
                  checkboxesClicked.push(checkbox);
                  await clickLikeHuman(checkbox);
                  await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT);
                }

                if (checkboxesClicked.length > 0) {
                  await autoScroll(page, 10, 500);
                  await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT);
                  for (const checkbox of checkboxesClicked) {
                    await clickLikeHuman(checkbox);
                    await waitAfterAction(page, WAIT_FOR_NAVIGATION_TIMEOUT);
                  }
                }
              } finally {
                page.off('response', responseListener);
                responseListener = null;
              }

              console.log(`[Task ${taskIndex}]   Back to category: ${categoryName}`);
              const categoryButton = departmentsContainer.getByRole('button', { name: categoryName, exact: true }).first();
              await categoryButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
              await clickLikeHuman(categoryButton);
              await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
            }

            console.log(`[Task ${taskIndex}]   Back to all departments`);
            try {
              const breadcrumbButton = departmentsContainer.getByTestId('breadcrumb').getByRole('button').first();
              await breadcrumbButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
              await clickLikeHuman(breadcrumbButton);
              await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
            } catch (e) {
              const allDepartmentsButton = page.locator('[data-testid="filter-departments-all"]');
              await allDepartmentsButton.waitFor({ state: 'visible', timeout: WAIT_FOR_SELECTOR_TIMEOUT });
              await clickLikeHuman(allDepartmentsButton);
              await page.waitForTimeout(randomTimeout(WAIT_FOR_NAVIGATION_TIMEOUT));
            }
          })(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Category timeout after ${CATEGORY_TIMEOUT_MS / 1000}s`)), CATEGORY_TIMEOUT_MS)),
        ]);
      } catch (error: any) {
        console.error(`[Task ${taskIndex}] Error on category index ${i}: ${error.message}`);

        if (responseListener) {
          page.off('response', responseListener);
          responseListener = null;
        }

        console.log(`[Task ${taskIndex}] Recreating browser after category error...`);
        try {
          await recreateBrowser();
        } catch (recreateError: any) {
          console.error(`[Task ${taskIndex}] Failed to recreate browser:`, recreateError.message);
          break;
        }

        try {
          ({ departmentsContainer, mainDepartments } = await setupFilters());
          if (i >= mainDepartments.length) break;
          // Fall through to for-loop increment to skip this failed category
        } catch (setupError: any) {
          console.error(`[Task ${taskIndex}] Failed to reload page after category error:`, setupError.message);
          break;
        }
      }
    }

    await browser.close();

    return products;
  } catch (error: any) {
    console.error(`[Task ${taskIndex}] Fatal error during scraping:`, error);

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Failed to close browser:', closeError);
      }
    }

    return products;
  }
};
