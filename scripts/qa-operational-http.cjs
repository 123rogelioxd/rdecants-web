// Frontend modules -> real Laravel HTTP -> a fresh synthetic SQLite only.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const backend = path.resolve(process.env.QA_BACKEND_ROOT || '');
const php = process.env.QA_PHP || 'php';
assert.ok(process.env.QA_BACKEND_ROOT && fs.existsSync(path.join(backend, 'vendor/autoload.php')), 'Set QA_BACKEND_ROOT to a prepared local checkout');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rdecants-http-qa-'));
const database = path.join(directory, 'synthetic.sqlite');
fs.writeFileSync(database, '');
const openssl = process.env.QA_OPENSSL || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
const keyPath = path.join(directory, 'localhost.key'); const certPath = path.join(directory, 'localhost.crt');
const certificate = spawnSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', keyPath, '-out', certPath, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8', windowsHide: true });
assert.equal(certificate.status, 0, 'QA requires OpenSSL to create an ephemeral localhost certificate');
const tls = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
for (const part of ['framework/cache/data', 'framework/sessions', 'framework/views', 'logs']) fs.mkdirSync(path.join(directory, 'storage', part), { recursive: true });
const fixture = path.join(root, 'tests/fixtures/operational-http-backend.php');
const state = { now: '2026-10-10 09:00:00', frontend_origin: '' };
const saveState = () => fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify(state));
const env = { ...process.env, QA_BACKEND_ROOT: backend, QA_HTTP_DIRECTORY: directory,
  APP_ENV: 'testing', APP_KEY: 'base64:MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=', APP_DEBUG: 'true',
  DB_CONNECTION: 'sqlite', DB_DATABASE: database, DB_URL: '', CACHE_STORE: 'array', QUEUE_CONNECTION: 'sync',
  SESSION_DRIVER: 'array', MAIL_MAILER: 'array', BROADCAST_CONNECTION: 'null', BCRYPT_ROUNDS: '4',
  FULFILLMENT_CLOCK_TIMEZONE: 'UTC', TENANCY_CONTEXT_MODE: 'prefer_context',
  APP_CONFIG_CACHE: path.relative(backend, path.join(directory, 'config.php')), APP_ROUTES_CACHE: path.relative(backend, path.join(directory, 'routes.php')),
  APP_SERVICES_CACHE: path.relative(backend, path.join(directory, 'services.php')), APP_PACKAGES_CACHE: path.relative(backend, path.join(directory, 'packages.php')),
  TELESCOPE_ENABLED: 'false', PULSE_ENABLED: 'false', NIGHTWATCH_ENABLED: 'false', LOG_CHANNEL: 'single',
};
function cli(command, ...args) {
  const run = spawnSync(php, ['-d', 'memory_limit=1G', fixture, command, ...args.map(String)], { env, cwd: backend, encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (run.status !== 0) throw new Error(`QA ${command} failed: ${run.stderr || run.stdout}`);
  try { return JSON.parse(run.stdout); } catch { throw new Error(`QA ${command} returned invalid JSON: ${run.stdout.slice(-4000)}`); }
}
const frontend = https.createServer(tls, (request, response) => {
  const target = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname));
  if (!target.startsWith(root + path.sep)) return response.writeHead(403).end();
  fs.readFile(target, (error, data) => {
    if (error) return response.writeHead(404).end();
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(target)] || 'application/octet-stream');
    response.end(data);
  });
});
async function freePort() {
  const temporary = http.createServer();
  await new Promise(resolve => temporary.listen(0, '127.0.0.1', resolve));
  const port = temporary.address().port;
  await new Promise(resolve => temporary.close(resolve)); return port;
}
async function waitForApi(base) {
  for (let i = 0; i < 100; i++) {
    try { const response = await fetch(base + '/api/web/delivery/options'); if (response.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Local API did not start');
}
const address = street => ({ recipient: 'Synthetic buyer', phone: '9511111111', street, exterior_number: '10', neighborhood: 'Centro', municipio: 'Oaxaca de Juárez', city: 'Oaxaca de Juárez', state: 'Oaxaca', postal_code: '68000', references: 'Synthetic reference' });
(async () => {
  await new Promise(resolve => frontend.listen(0, '127.0.0.1', resolve));
  state.frontend_origin = `https://127.0.0.1:${frontend.address().port}`; saveState();
  const seeded = cli('setup');
  const phpBase = `http://127.0.0.1:${await freePort()}`;
  const proxy = https.createServer(tls, (request, response) => {
    const upstream = http.request(phpBase + request.url, { method: request.method, headers: request.headers }, incoming => { response.writeHead(incoming.statusCode, incoming.headers); incoming.pipe(response); });
    upstream.on('error', () => response.writeHead(502).end()); request.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const api = `https://127.0.0.1:${proxy.address().port}`;
  const logs = fs.openSync(path.join(directory, 'http.log'), 'a');
  const server = spawn(php, ['-d', 'memory_limit=1G', '-S', phpBase.replace('http://', ''), fixture], { cwd: backend, env, stdio: ['ignore', logs, logs], windowsHide: true });
  let browser;
  const checks = [];
  const check = (name, evidence) => { checks.push({ name, passed: true, ...evidence }); console.log(`PASS ${name}`); };
  try {
    await waitForApi(phpBase);
    browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER || 'msedge' });
    const context = await browser.newContext({ viewport: { width: 390, height: 812 }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    const url = state.frontend_origin + '/tests/fixtures/operational-http-checkout.html?api=' + encodeURIComponent(api);
    await page.goto(url); await page.waitForFunction(() => window.qaReady);
    const add = async (...indexes) => {
      await page.evaluate(async indexes => {
        const products = await checkoutQA.CatalogProvider.getProducts();
        for (const id of indexes) { const product = products.find(p => p.product_id === id); if (product) await checkoutQA.Cart.add(product.id, 5); }
      }, indexes.map(i => seeded.products[i].product_id));
      const count = await page.evaluate(() => checkoutQA.Cart.count());
      if (!count) throw new Error('Synthetic cart remained empty: ' + JSON.stringify(await page.evaluate(() => checkoutQA.CatalogProvider.getProducts())));
    };
    const open = async () => { await page.locator('#open').click(); await page.waitForFunction(() => !document.getElementById('checkout-overlay').hidden); };
    const prepare = async (street, preference = 'tarde', mode = 'local') => {
      const value = address(street);
      await page.evaluate(async ({ value, preference, mode }) => {
        const { Delivery, Cart, renderDeliveryPanel } = checkoutQA;
        Delivery.setMode(mode); await Delivery.refreshWindows();
        for (const [key, val] of Object.entries(value)) Delivery.setAddressField(key, val);
        if (mode === 'local' && preference) Delivery.setPreference('2026-10-10', preference);
        await Delivery.quote({ items: Cart.items.map(i => ({ product_id: i.product_id, variant_id: i.variant_id, quantity: i.qty })) });
        renderDeliveryPanel();
      }, { value, preference, mode });
      await page.waitForFunction(() => checkoutQA.Delivery.isReady());
    };
    const submit = async () => {
      await page.locator('#checkout-next').click(); await page.locator('#checkout-step-confirm').waitFor({ state: 'visible' });
      const response = page.waitForResponse(r => r.url() === api + '/api/web/orders' && r.request().method() === 'POST');
      await page.locator('#checkout-next').click();
      const reply = await response; const data = await reply.json();
      assert.equal(reply.status(), 201, JSON.stringify(data));
      await page.locator('#checkout-step-registered').waitFor({ state: 'visible' });
      return { data, payload: reply.request().postDataJSON() };
    };
    const nextPurchase = async (...indexes) => {
      await page.locator('#checkout-keep-shopping').click(); await page.waitForTimeout(4100); await add(...indexes); await open();
    };

    await add(0); await open(); await prepare('First synthetic street');
    assert.equal(await page.locator('[name="save-address"]:checked').count(), 0);
    await page.locator('[name="save-address"][value="yes"]').check();
    const first = await submit();
    assert.equal(first.data.order.address_saved, true); assert.equal(first.data.order.grand_total, 190);
    const message = new URL(first.data.order.whatsapp_url).searchParams.get('text');
    assert.match(message, /First fixture/i); assert.match(message, /5 ml/); assert.match(message, /190\.00/); assert.match(message, /10\/10\/2026/);
    assert.ok(!message.includes(first.data.order.folio));
    const cookies = await context.cookies(api);
    assert.ok(cookies.some(c => c.name === 'rd_customer' && c.httpOnly && c.sameSite === 'Lax'));
    const firstState = cli('inspect');
    assert.equal(firstState.notifications.length, 1); assert.equal(firstState.notifications[0].user_id, seeded.owner_id);
    assert.equal(firstState.orders[0].operation.date, '2026-10-10'); assert.equal(firstState.orders[0].operation.requested_window, 'Hoy · 1 - 4 pm');
    assert.equal(firstState.sales_count, 0); assert.equal(firstState.commerce_count, 1);
    await page.screenshot({ path: path.join(directory, 'scenario-1-registered.png') });
    check('1-new-customer-consent-notice-canonical-message', { order_id: firstState.orders[0].id, total: 190 });
    check('4-requested-window-reaches-canonical-operation', { date: firstState.orders[0].operation.date, window: firstState.orders[0].operation.requested_window });

    await nextPurchase(0); await page.locator('#checkout-saved-address').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-address="street"]').inputValue(), '');
    await page.screenshot({ path: path.join(directory, 'scenario-2-reuse-choice.png') });
    await page.locator('#checkout-use-address').click(); await page.waitForFunction(() => checkoutQA.Delivery.isReady());
    assert.equal(await page.locator('[data-address="street"]').inputValue(), 'First synthetic street');
    await submit(); check('2-returning-customer-explicit-reuse', {});

    await nextPurchase(0); await page.locator('#checkout-other-address').click();
    assert.equal(await page.locator('[data-address="street"]').inputValue(), '');
    await prepare('Temporary synthetic street'); await page.locator('[name="save-address"][value="no"]').check(); await submit();
    const recurring = await page.evaluate(() => checkoutQA.ApiClient.getAccount());
    assert.equal(recurring.data.delivery.address.street, 'First synthetic street');
    assert.equal(cli('inspect').orders[2].address.street, 'Temporary synthetic street');
    check('3-other-address-preserves-previous-consent', {});

    await nextPurchase(0); await page.locator('#checkout-use-address').click(); await page.waitForFunction(() => checkoutQA.Delivery.isReady());
    await page.evaluate(() => { checkoutQA.Delivery.setPreference('2026-10-10', 'tarde'); checkoutQA.renderDeliveryPanel(); });
    await page.locator('#checkout-next').click(); await page.locator('#checkout-step-confirm').waitFor({ state: 'visible' });
    const beforeRejected = cli('inspect');
    const retainedToken = await page.evaluate(() => checkoutQA.Delivery.selectedToken);
    state.now = '2026-10-10 15:30:00'; saveState();
    const rejection = page.waitForResponse(r => r.url() === api + '/api/web/orders' && r.request().method() === 'POST');
    await page.locator('#checkout-next').click(); assert.equal((await rejection).status(), 422);
    await page.locator('#delivery-preference-error').waitFor({ state: 'visible' });
    const preserved = await page.evaluate(() => ({ count: checkoutQA.Cart.count(), street: checkoutQA.Delivery.address.street, token: checkoutQA.Delivery.selectedToken, preference: checkoutQA.Delivery.preference, blocked: !checkoutQA.Delivery.isReady() }));
    assert.equal(preserved.count, 1); assert.equal(preserved.street, 'First synthetic street'); assert.equal(preserved.token, retainedToken); assert.equal(preserved.preference.window, 'tarde'); assert.equal(preserved.blocked, true);
    const afterRejected = cli('inspect'); assert.equal(afterRejected.orders.length, beforeRejected.orders.length); assert.equal(afterRejected.reservations, beforeRejected.reservations); assert.equal(afterRejected.notifications.length, beforeRejected.notifications.length);
    await page.screenshot({ path: path.join(directory, 'scenario-5-reselect-422.png') });
    await page.evaluate(() => { checkoutQA.Delivery.setPreference('2026-10-10', 'noche'); checkoutQA.renderDeliveryPanel(); }); await submit();
    check('5-expired-window-keeps-cart-and-requires-reselection', { orders_before: beforeRejected.orders.length, orders_after_rejection: afterRejected.orders.length });

    const replayState = cli('inspect');
    const replay = await page.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), first.payload);
    assert.equal(replay.order.folio, first.data.order.folio);
    const afterReplay = cli('inspect'); assert.equal(afterReplay.orders.length, replayState.orders.length); assert.equal(afterReplay.notifications.length, replayState.notifications.length); assert.equal(afterReplay.reservations, replayState.reservations);
    check('idempotent-replay-one-order-hold-and-notice', {});

    const guestContext = await browser.newContext({ ignoreHTTPSErrors: true }); const guest = await guestContext.newPage();
    await guest.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await guest.goto(url); await guest.waitForFunction(() => window.qaReady);
    const guestPayload = { ...first.payload, idempotency_key: 'future-guest-same-phone', delivery: { ...first.payload.delivery, preference: null, save_address: true, address: address('Other browser private street') } };
    const guestOrder = await guest.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), guestPayload);
    const guestAccount = await guest.evaluate(() => checkoutQA.ApiClient.getAccount()); assert.equal(guestAccount.status, 401);
    const ownerAccount = await page.evaluate(() => checkoutQA.ApiClient.getAccount()); assert.equal(ownerAccount.data.orders_count, afterReplay.orders.length);
    const deniedDetail = await page.evaluate(folio => checkoutQA.ApiClient.getAccountOrder(folio), guestOrder.order.folio); assert.equal(deniedDetail.status, 404);
    const replayGuest = await guest.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), first.payload); assert.equal(replayGuest.order.folio, first.data.order.folio); assert.equal((await guest.evaluate(() => checkoutQA.ApiClient.getAccount())).status, 401);
    check('same-phone-and-guest-retry-never-grant-history-or-future-address', {});

    const multiPayload = { ...guestPayload, idempotency_key: 'multi-canonical', customer: { name: 'Synthetic multi buyer', phone: '9512222222' }, items: seeded.products.slice(0, 2).map(p => ({ product_id: p.product_id, variant_id: p.variant_id, quantity: 1, unit_price: 1 })), delivery: { mode: 'national', address: { ...address('National synthetic street'), phone: '9512222222' }, save_address: false } };
    const quote = await guest.evaluate(payload => checkoutQA.ApiClient.quoteDelivery({ items: payload.items, mode: 'national', postal_code: '68000' }), multiPayload);
    assert.equal(quote.data.pricing.merchandise_total, 350); assert.equal(quote.data.delivery.options[0].amount, 30); multiPayload.delivery.option_token = quote.data.delivery.options[0].token;
    const multi = await guest.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), multiPayload);
    assert.equal(multi.order.grand_total, 380); const multiMessage = new URL(multi.order.whatsapp_url).searchParams.get('text'); assert.match(multiMessage, /First fixture/i); assert.match(multiMessage, /Second fixture/i); assert.match(multiMessage, /380\.00/);
    check('multi-item-browser-prices-ignored-real-signed-national-quote', { total: 380 });

    const stockPayload = { ...guestPayload, idempotency_key: 'last-unit', customer: { name: 'Synthetic stock buyer', phone: '9513333333' }, items: [{ product_id: seeded.products[2].product_id, variant_id: seeded.products[2].variant_id, quantity: 1 }] };
    await guest.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), stockPayload);
    const catalog = await guest.evaluate(() => checkoutQA.ApiClient.getCatalog()); const listed = Array.isArray(catalog) ? catalog : catalog.data;
    assert.ok(!listed.some(p => p.product_id === seeded.products[2].product_id));
    const stockState = cli('inspect');
    const stockRetry = await guest.evaluate(async payload => { try { await checkoutQA.ApiClient.createWebOrder(payload); return 201; } catch (error) { return error.status; } }, { ...stockPayload, idempotency_key: 'second-last-unit' });
    assert.equal(stockRetry, 422); assert.equal(cli('inspect').orders.length, stockState.orders.length);
    check('reserved-last-unit-hides-from-real-catalog-and-rejects-oversell', {});

    const activeGuestSession = stockState.sessions.find(s => s.revoked_at === null && s.id !== firstState.sessions[0].id);
    assert.ok(activeGuestSession);
    const switched = { ...multiPayload, idempotency_key: 'shared-browser-switch', items: [multiPayload.items[0]] };
    await guest.evaluate(payload => checkoutQA.ApiClient.createWebOrder(payload), switched);
    assert.equal((await guest.evaluate(() => checkoutQA.ApiClient.getAccount())).status, 401);
    assert.ok(cli('inspect').sessions.find(s => s.id === activeGuestSession.id).revoked_at);
    check('shared-browser-switch-revokes-presented-cookie-without-phone-login', {});

    state.organization_slug = 'qa-other'; saveState();
    assert.equal((await page.evaluate(() => checkoutQA.ApiClient.getAccount())).status, 401);
    state.organization_slug = 'rdecants'; saveState();
    assert.equal((await page.evaluate(() => checkoutQA.ApiClient.getAccount())).status, 200);
    check('cookie-and-account-fail-closed-in-another-tenant', {});

    const localForget = await page.evaluate(async () => { try { await checkoutQA.Account.forgetAddress(); return 200; } catch (error) { return error.status; } }); assert.equal(localForget, 403);
    assert.equal((await page.evaluate(() => checkoutQA.ApiClient.getAccount())).data.delivery.address_saved, true);
    const authorizedForget = await context.request.post(api + '/api/web/account/address/forget', { headers: { Origin: 'https://rdecants.com', Accept: 'application/json' }, data: {} }); assert.equal(authorizedForget.status(), 200);
    assert.equal((await page.evaluate(() => checkoutQA.ApiClient.getAccount())).data.delivery.address_saved, false);
    assert.equal(cli('inspect').orders[0].address.street, 'First synthetic street');
    check('forget-origin-guard-and-consent-revocation-preserve-history', {});

    const firstSessionId = firstState.sessions[0].id; cli('expire-session', firstSessionId);
    assert.equal((await page.evaluate(() => checkoutQA.ApiClient.getAccount())).status, 401);
    check('expired-cookie-fails-closed', {});
    assert.equal(await page.evaluate(() => localStorage.getItem('rdecants_delivery_choice')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('rdecants_checkout_customer')), null);
    assert.deepEqual(pageErrors, []);
    const final = cli('inspect'); assert.equal(final.sales_count, 0); assert.equal(final.shipments_count, 0); assert.equal(final.commerce_count, final.orders.length); assert.equal(final.notifications.length, final.orders.length);
    check('no-sales-labels-payments-or-external-messages', { orders: final.orders.length, notices: final.notifications.length, sales: 0, shipments: 0 });
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify({ checks, backend, seeded, final, pageErrors, limitations: ['Synthetic carrier and pricing fixture; no provider integration', 'APP_ENV testing correctly rejects localhost forget; authorized Origin exercised through HTTP context request', 'No physical iOS keyboard or zoom validation', 'No payment or sale confirmation in this checkout traversal'] }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, directory }));
    await guestContext.close(); await context.close();
  } finally {
    if (browser) await browser.close(); server.kill(); await Promise.all([new Promise(resolve => frontend.close(resolve)), new Promise(resolve => proxy.close(resolve))]); fs.closeSync(logs);
  }
})().catch(error => { console.error(error); frontend.close(); process.exitCode = 1; });
