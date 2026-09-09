// Local QA server: static working tree + read-only production API proxy.
// Creating orders, quote requests and analytics in production is forbidden here.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const port = Number(process.env.PORT || 8080);
const quoteReferences = new Map();

/* -- QA fixtures for the customer-continuity loop --------------------------
   Everything below is LOCAL AND FAKE. It exists so the whole loop -- order,
   recognition, "Mis pedidos", status, delivery preference -- can be walked in a
   browser without creating a single production record. None of these numbers,
   folios or windows is business truth; the real answers come from R Supply OS.

   The session is modelled the way the API does it: an opaque token in an
   HttpOnly cookie, resolved server-side. The page never sees it, which is the
   property being verified. */
const QA_COOKIE = 'rd_customer';
const qaSessions = new Map();   // token -> customer key
const qaOrders = [];            // newest last
let qaFolio = 0;

const qaDay = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const QA_WINDOWS = [
  { key: 'manana', label: '10 am - 1 pm' },
  { key: 'tarde', label: '1 - 4 pm' },
  { key: 'noche', label: '4 - 7 pm' },
];
const qaWindowOffer = () => ({
  enabled: true, kind: 'requested', is_guaranteed: false,
  days: [
    { date: qaDay(0), label: 'Hoy', is_today: true, windows: QA_WINDOWS },
    { date: qaDay(1), label: 'Manana', is_today: false, windows: QA_WINDOWS },
    { date: qaDay(2), label: 'Pasado', is_today: false, windows: QA_WINDOWS },
  ],
});
const qaWindowLabel = key => (QA_WINDOWS.find(w => w.key === key) || {}).label ?? null;

function qaSession(req) {
  const raw = req.headers.cookie ?? '';
  const match = raw.split(';').map(c => c.trim()).find(c => c.startsWith(QA_COOKIE + '='));
  const token = match ? decodeURIComponent(match.slice(QA_COOKIE.length + 1)) : '';
  return token && qaSessions.has(token) ? { token, customer: qaSessions.get(token) } : null;
}

function qaProject(entry) {
  return {
    folio: entry.order.folio, created_at: entry.created_at,
    status: { progress: 'registrado', progress_label: 'Pedido registrado',
      progress_detail: 'Ya tenemos tu pedido y tu inventario esta apartado. Confirmamos los detalles por WhatsApp.',
      is_open: true, payment: 'por_confirmar', payment_label: 'Pago por confirmar' },
    item_count: entry.items.length, preview: entry.items.slice(0, 2),
    summary_line: entry.items.length === 1 ? entry.items[0].name : entry.items.length + ' productos',
    delivery: { mode: entry.order.delivery.mode, shipping_cost: entry.order.delivery.shipping_cost,
      requires_manual_quote: entry.order.delivery.requires_manual_quote,
      preference_label: entry.order.delivery.preference?.label ?? null },
    merchandise_total: entry.order.total, total: entry.order.grand_total,
  };
}

const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.avif':'image/avif', '.json':'application/json' };
http.createServer(async (req,res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  res.setHeader('Cache-Control','no-store');
  try {
    if (req.method === 'GET' && url.pathname.startsWith('/storage/')) {
      const upstream = await fetch(`https://api.rdecants.com${url.pathname}`);
      res.writeHead(upstream.status, {'Content-Type':upstream.headers.get('Content-Type') || 'application/octet-stream'});
      res.end(Buffer.from(await upstream.arrayBuffer())); return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        const localChunks = []; for await (const chunk of req) localChunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(localChunks).toString() || '{}');
        res.setHeader('Content-Type','application/json');
        if (url.pathname === '/api/web/quote/price') {
          const unavailable = (payload.items ?? []).filter(i=>!quoteReferences.has(i.reference)).map(i=>i.reference);
          const items = (payload.items ?? []).filter(i=>quoteReferences.has(i.reference)).map(i=>({...quoteReferences.get(i.reference),quantity:i.quantity,line_total:quoteReferences.get(i.reference).price*i.quantity}));
          res.end(JSON.stringify({ok:true,items,unavailable,total:items.reduce((n,i)=>n+i.line_total,0)})); return;
        }
        if (url.pathname === '/api/web/delivery/quote') {
          const manual = payload.postal_code === '99999' || payload.mode === 'national';
          res.end(JSON.stringify({ ok:true, delivery:{ requires_manual_quote:manual, reason:manual?'Cotización por confirmar':null, options:manual?[]:[{token:'local-qa-token',amount:30,label:'Entrega local',provider:'local',service:'local'}] } })); return;
        }
        if (url.pathname === '/api/web/orders') {
          /* Mirrors the real response shape, including the two nulls that must
             survive: an unpriced delivery has no shipping cost and therefore no
             grand total. */
          const preference = payload.delivery?.preference ?? null;
          const label = preference ? qaWindowLabel(preference.window) : null;
          const local = payload.delivery?.mode === 'local';
          const shipping = local ? 30 : null;
          const items = (payload.metadata?.cart_items ?? []).map(i => ({ name: i.name, brand: i.house, image: i.image, ml: 5, quantity: 1, unit_price: 120, line_total: 120 }));
          const folio = 'WEB-QA-' + String(++qaFolio).padStart(4, '0');
          const order = {
            folio, status: 'pending', subtotal: 120, discount: 0, total: 120,
            delivery: {
              mode: payload.delivery?.mode ?? null, shipping_cost: shipping,
              requires_manual_quote: shipping === null,
              /* Local only, and rebuilt from the catalogue -- a posted label is
                 ignored exactly as the server ignores it. */
              preference: local && preference && label
                ? { kind: 'requested', is_guaranteed: false, date: preference.date, day_label: 'Hoy',
                    window: preference.window, window_label: label, starts_at: '16:00', ends_at: '19:00',
                    label: 'Hoy \u00b7 ' + label }
                : null,
            },
            grand_total: shipping === null ? null : 120 + shipping,
            whatsapp_url: null,
          };
          qaOrders.push({ order, items, created_at: new Date().toISOString(), customer: 'qa' });

          /* The browser is remembered the way the API does it: HttpOnly, so
             nothing on the page can read this value. */
          const token = 'qa-' + Math.random().toString(36).slice(2) + Date.now();
          qaSessions.set(token, 'qa');
          res.setHeader('Set-Cookie', QA_COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=15552000');
          res.writeHead(201);
          res.end(JSON.stringify({ ok: true, order })); return;
        }
        if (url.pathname === '/api/web/account/forget') {
          const session = qaSession(req);
          if (session) qaSessions.delete(session.token);
          res.setHeader('Set-Cookie', QA_COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
          res.end(JSON.stringify({ ok: true, authenticated: false })); return;
        }
        res.writeHead(403); res.end(JSON.stringify({message:'QA: production writes blocked'})); return;
      }
      /* -- Account reads, answered locally ------------------------------
         Never proxied: production must not be asked about a QA customer, and a
         guest here has to be a real 401 so the empty state can be seen. */
      if (url.pathname.startsWith('/api/web/account')) {
        res.setHeader('Content-Type', 'application/json');
        const session = qaSession(req);
        if (!session) { res.writeHead(401); res.end(JSON.stringify({ ok: false, authenticated: false, message: 'Registra un pedido para ver tu historial aqui.' })); return; }
        const mine = qaOrders.filter(o => o.customer === session.customer);
        if (url.pathname === '/api/web/account') {
          res.end(JSON.stringify({ ok: true, authenticated: true, customer: { name: 'Roger QA', phone: '9511111111' },
            delivery: mine.length ? { mode: 'local', address: { postal_code: '71200', street: 'Independencia', exterior_number: '140', neighborhood: 'Centro', city: 'Zimatlan de Alvarez', state: 'Oaxaca', interior_number: null, references: null } } : null,
            orders_count: mine.length })); return;
        }
        if (url.pathname === '/api/web/account/orders') {
          res.end(JSON.stringify({ ok: true, authenticated: true, orders: mine.slice().reverse().map(qaProject) })); return;
        }
        const folio = decodeURIComponent(url.pathname.split('/').pop());
        const found = mine.find(o => o.order.folio === folio);
        if (!found) { res.writeHead(404); res.end(JSON.stringify({ ok: false, message: 'No encontramos ese pedido.' })); return; }
        const base = qaProject(found);
        res.end(JSON.stringify({ ok: true, authenticated: true, order: { ...base, items: found.items,
          subtotal: found.order.subtotal, discount: found.order.discount,
          delivery: { ...base.delivery, preference_is_guaranteed: false, destination: 'Independencia 140 \u00b7 Centro', recipient: 'Roger QA' },
          notes: null } })); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const upstream = await fetch(`https://api.rdecants.com${url.pathname}${url.search}`, { method:'GET', headers:{'Accept':'application/json'} });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (url.pathname === '/api/web/quote/search') {
        const data = JSON.parse(bytes.toString());
        for (const item of data.results ?? []) quoteReferences.set(item.reference,item);
      }
      /* Production has not deployed the window catalogue yet, so it is injected
         here to exercise the selector. Synthetic -- never a real availability. */
      if (url.pathname === '/api/web/delivery/options') {
        const data = JSON.parse(bytes.toString());
        if (!data.delivery_windows) data.delivery_windows = qaWindowOffer();
        res.writeHead(upstream.status, {'Content-Type':'application/json'});
        res.end(JSON.stringify(data)); return;
      }
      res.writeHead(upstream.status, {'Content-Type':'application/json'}); res.end(bytes); return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    const page = url.pathname.startsWith('/perfume/') ? '/product.html' : url.pathname;
    const file = resolve(root, '.' + decodeURIComponent(page === '/' ? '/index.html' : page));
    if (!file.startsWith(root+sep) || /[\\/]\./.test(file.slice(root.length))) { res.writeHead(403); res.end(); return; }
    let content = await readFile(file);
    if (url.pathname === '/assets/js/api/config.js') content = Buffer.from(content.toString().replace('globalThis.window?.__RDECANTS_API_BASE__ ||', `"http://127.0.0.1:${port}" ||`));
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream'}); res.end(content);
  } catch (error) { res.writeHead(404); res.end('Preview resource unavailable'); }
}).listen(port,'127.0.0.1',()=>console.log(`QA preview http://127.0.0.1:${port}; production writes blocked`));
