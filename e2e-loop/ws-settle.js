// Settle test: is the relay WS failure a product bug or navigation-race artifact?
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/home/TWIG/.local/bin/chromium', args: ['--no-sandbox'] });
  const c = await b.newContext();
  const p = await c.newPage();
  let wserrs = 0;
  p.on('console', m => { if (m.type() === 'error' && /websocket/i.test(m.text())) { wserrs++; console.log('WSERR:', m.text().slice(0, 140)); } });
  p.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 140)));
  await p.goto('http://127.0.0.1:8096/?view=chat&state=jacked', { waitUntil: 'networkidle', timeout: 30000 });
  await p.waitForTimeout(12000);
  console.log('ws-errors-after-12s-settle:', wserrs);
  // check relay status surface in UI
  const txt = await p.locator('body').innerText();
  const m = txt.match(/(relay|link|connect)[^\n]{0,80}/gi);
  console.log('relay-surface:', m ? m.slice(0, 4).join(' | ') : 'none');
  await b.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
