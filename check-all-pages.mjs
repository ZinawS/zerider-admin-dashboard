import { chromium } from '@playwright/test';
import { mkdirSync } from 'fs';

mkdirSync('/tmp/check-pages', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(12000);

const errors = {};

const listen = (route) => {
  errors[route] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors[route].push(m.text()); });
  page.on('pageerror', (e) => errors[route].push('PAGE: ' + e.message));
};

// Login
await page.goto('http://localhost:5173');
await page.waitForTimeout(800);
const emailInput = page.locator('input[type="email"], input[name="email"]').first();
if (await emailInput.isVisible()) {
  await emailInput.fill('super@rideshare.com');
  await page.locator('input[type="password"]').first().fill('SuperAdmin123!');
  await page.locator('button[type="submit"], button:has-text("Continue")').first().click();
  await page.waitForTimeout(3000);
}

const routes = [
  ['/rides',       'Rides'],
  ['/drivers',     'Drivers'],
  ['/users',       'Users (Riders)'],
  ['/payouts',     'Payouts'],
  ['/pricing',     'Pricing'],
  ['/analytics',   'Analytics'],
  ['/reports',     'Reports'],
  ['/delivery',    'Delivery'],
  ['/marketplace', 'Marketplace'],
  ['/regions',     'Regions'],
  ['/support',     'Support'],
  ['/gamification','Gamification'],
  ['/wallet',      'Wallet'],
  ['/settings',    'Settings'],
  ['/content',     'Content'],
];

for (const [route, label] of routes) {
  const key = route.slice(1);
  errors[key] = [];
  const onErr = (m) => { if (m.type() === 'error') errors[key].push(m.text()); };
  const onPageErr = (e) => errors[key].push('PAGE: ' + e.message);
  page.on('console', onErr);
  page.on('pageerror', onPageErr);

  await page.goto(`http://localhost:5173${route}`);
  await page.waitForTimeout(3000);

  const url = page.url();
  const loggedOut = url.includes('/login') || url.includes('/auth');

  await page.screenshot({ path: `/tmp/check-pages/${key}.png`, fullPage: false });

  page.off('console', onErr);
  page.off('pageerror', onPageErr);

  const apiErrors = errors[key].filter(e => /4\d\d|5\d\d|network|failed|error/i.test(e));
  console.log(`${label} (${route}): url=${url} | loggedOut=${loggedOut} | consoleErrors=${errors[key].length} | apiErrors=${apiErrors.length}`);
  if (apiErrors.length) console.log('  API errors:', apiErrors.slice(0, 3));
  if (errors[key].filter(e => !/favicon|WARN|deprecat/i.test(e)).length > 0 && apiErrors.length === 0) {
    console.log('  Other errors:', errors[key].filter(e => !/favicon|WARN|deprecat/i.test(e)).slice(0, 2));
  }
}

await browser.close();
