export const IS_CI = process.env.CI === 'true';
export const WAIT_FOR_CLICK_TIMEOUT = IS_CI ? 200 : 300;
export const WAIT_FOR_SELECTOR_TIMEOUT = IS_CI ? 4000 : 2500;
export const WAIT_FOR_NAVIGATION_TIMEOUT = IS_CI ? 6000 : 4000;
export const WAIT_FOR_NETWORK_IDLE_TIMEOUT = IS_CI ? 7500 : 5000;
export const GLOBAL_TIMEOUT = IS_CI ? 1000 : 500;
