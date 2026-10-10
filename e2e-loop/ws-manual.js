// Get the exact WS close code/reason from inside the browser.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/home/TWIG/.local/bin/chromium', args: ['--no-sandbox'] });
  const p = await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8096/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const out = await p.evaluate(() => new Promise((resolve) => {
    const key = 'f974e4ed72d72bbbd89ca3356a13d89c';
    let ws;
    try { ws = new WebSocket('ws://127.0.0.1:8096/relay/ws?key=' + key); }
    catch (e) { resolve('ctor-threw:' + e.message); return; }
    const t = setTimeout(() => resolve('timeout-open state=' + ws.readyState), 8000);
    ws.onopen = () => { clearTimeout(t); ws.send(JSON.stringify({ key, t: 'probe' })); resolve('OPEN-sent'); ws.close(); };
    ws.onclose = (e) => { clearTimeout(t); resolve(`CLOSE code=${e.code} reason=${e.reason} clean=${e.wasClean}`); };
    ws.onerror = () => {};
  }));
  console.log('manual-ws:', out);
  await b.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
