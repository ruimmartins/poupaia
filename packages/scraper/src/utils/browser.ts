import { Browser, Page } from 'playwright';
import { chromium } from 'playwright-extra';
import { getRandomUserAgent } from './utils';
import stealth from 'puppeteer-extra-plugin-stealth';

export const getBrowser = async (): Promise<{ browser: Browser; page: Page }> => {
  chromium.use(stealth());

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--disable-infobars', '--window-size=1366,768'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 608 },
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
    userAgent: getRandomUserAgent(),
  });

  const page = await context.newPage();
  return { browser, page };
};
