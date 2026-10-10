// Synthetic local QA only. No real API, order, payment or outbound message.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const checkoutRoot = path.resolve(__dirname, '..');
const root = process.env.QA_BASELINE_ROOT ? path.resolve(process.env.QA_BASELINE_ROOT) : checkoutRoot;
const output = process.env.QA_OUTPUT || path.join(require('node:os').tmpdir(), 'rdecants-operational-checkout-qa');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!target.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  const source = request.url === '/tests/fixtures/operational-checkout.html' ? path.join(checkoutRoot, 'tests/fixtures/operational-checkout.html') : target;
  fs.readFile(source, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(target)] || 'application/octet-stream');
    response.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER || 'msedge' });
  const results = [];
  try {
    for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: width < 768 ? 812 : 1000 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixtures/operational-checkout.html`);
      await page.waitForFunction(() => window.qaReady);
      await page.locator('#open').click();
      if (process.env.QA_BASELINE_ROOT) {
        await page.locator('[data-mode="local"]').click();
        await page.waitForFunction(() => window.checkoutQA.Delivery.isReady());
        await page.screenshot({ path: path.join(output, `before-${width}.png`) });
        results.push({ width, baseline: true });
        await context.close();
        continue;
      }
      await page.locator('#checkout-saved-address').waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-address="street"]').inputValue(), '');
      await page.screenshot({ path: path.join(output, `saved-choice-${width}.png`) });
      await page.locator('#checkout-use-address').click();
      await page.waitForFunction(() => window.checkoutQA.Delivery.isReady());
      assert.equal(await page.locator('[name="save-address"]:checked').count(), 0);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        scrollOverflow: document.getElementById('checkout-scroll').scrollWidth > document.getElementById('checkout-scroll').clientWidth,
        minInputFont: Math.min(...[...document.querySelectorAll('#checkout-overlay input:not([type="radio"]),#checkout-overlay select')].filter(e => e.getBoundingClientRect().width).map(e => parseFloat(getComputedStyle(e).fontSize))),
        ctaBottom: document.getElementById('checkout-next').getBoundingClientRect().bottom,
        height: innerHeight,
      }));
      assert.equal(layout.overflow, false); assert.equal(layout.scrollOverflow, false); assert.ok(layout.minInputFont >= 16); assert.ok(layout.ctaBottom <= layout.height);
      await page.evaluate(() => { checkoutQA.Delivery.setPreference('2026-10-10', 'tarde'); checkoutQA.renderDeliveryPanel(); });
      await page.locator('#checkout-next').click();
      await page.locator('#checkout-step-confirm').waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, `review-${width}.png`) });
      await page.locator('#checkout-next').click();
      await page.locator('#delivery-preference-error').waitFor({ state: 'visible' });
      const preserved = await page.evaluate(() => ({ count: checkoutQA.Cart.count(), street: checkoutQA.Delivery.address.street, token: checkoutQA.Delivery.selectedToken, preference: checkoutQA.Delivery.preference }));
      assert.equal(preserved.count, 1); assert.equal(preserved.street, 'Calle de prueba'); assert.equal(preserved.token, 'synthetic-local-token'); assert.equal(preserved.preference.window, 'tarde');
      await page.screenshot({ path: path.join(output, `reselect-422-${width}.png`) });
      await page.locator('[data-when-clear]').click();
      if (width < 768) {
        await page.setViewportSize({ width, height: 430 });
        await page.locator('[data-address="phone"]').focus();
        const keyboardLayout = await page.evaluate(() => ({ bottom: document.getElementById('checkout-next').getBoundingClientRect().bottom, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth }));
        assert.ok(keyboardLayout.bottom <= keyboardLayout.height); assert.equal(keyboardLayout.overflow, false);
        await page.screenshot({ path: path.join(output, `short-viewport-${width}.png`) });
        await page.setViewportSize({ width, height: 812 });
      }
      await page.locator('[data-address="phone"]').fill('9510000000');
      assert.equal(await page.locator('[data-address="street"]').inputValue(), '');
      assert.equal(await page.locator('#checkout-saved-address').isVisible(), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('rdecants_delivery_choice')), null);
      assert.deepEqual(errors, []);
      results.push({ width, layout, preserved, errors });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ output, widths: results.map(r => r.width), passed: results.length }));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
