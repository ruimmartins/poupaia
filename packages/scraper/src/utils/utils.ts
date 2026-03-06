import { Locator, Page } from 'playwright';
import { WAIT_FOR_CLICK_TIMEOUT } from '../constants/waiting-times';

export const randomTimeout = (value: number) => (Math.random() + 0.5) * value;

export const getRandomUserAgent = () => {
  const agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  ];
  return agents[Math.floor(Math.random() * agents.length)];
};

export const clickLikeHuman = async (element: Locator) => {
  await new Promise(resolve => setTimeout(resolve, randomTimeout(WAIT_FOR_CLICK_TIMEOUT)));
  await element.click();
};

export const autoScroll = async (page: Page, times: number = 5, intervalMs: number = 1000) => {
  for (let i = 0; i < times; i++) {
    const amountPxScrolled = Math.random() * 300 + 200;
    await page.evaluate(amount => {
      window.scrollBy(0, amount);
    }, amountPxScrolled);

    await page.waitForTimeout(randomTimeout(intervalMs));

    const reachedBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight);

    if (reachedBottom) break;
  }
};
