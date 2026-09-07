// Local QA server: static working tree + read-only production API proxy.
// Creating orders, quote requests and analytics in production is forbidden here.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const port = Number(process.env.PORT || 8080);
const quoteReferences = new Map();
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
          res.end(JSON.stringify({ok:true,order:{folio:'WEB-QA-LOCAL',status:'pending',delivery_cost:null,grand_total:null}})); return;
        }
        res.writeHead(403); res.end(JSON.stringify({message:'QA: production writes blocked'})); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const upstream = await fetch(`https://api.rdecants.com${url.pathname}${url.search}`, { method:'GET', headers:{'Accept':'application/json'} });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (url.pathname === '/api/web/quote/search') {
        const data = JSON.parse(bytes.toString());
        for (const item of data.results ?? []) quoteReferences.set(item.reference,item);
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
