// Does this Brave build do WebSocket at all? public wss vs local ws.
const { chromium } = require('playwright-core');
const net = require('net');
const crypto = require('crypto');
const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    if (!buf.toString('latin1').includes('\r\n\r\n')) return;
    const m = buf.toString('latin1').match(/Sec-WebSocket-Key: (\S+)/);
    const accept = crypto.createHash('sha1').update(m[1] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  });
});
const tryWs = (page, url) => page.evaluate((u) => new Promise((res) => {
  let ws; try { ws = new WebSocket(u); } catch (e) { res('ctor:' + e.message); return; }
  const t = setTimeout(() => res('timeout state=' + ws.readyState), 7000);
  ws.onopen = () => { clearTimeout(t); res('OPEN'); try { ws.close(); } catch (e) {} };
  ws.onclose = (e) => { clearTimeout(t); res('CLOSE ' + e.code); };
}), url);
(async () => {
  await new Promise(r => server.listen(18098, '127.0.0.1', r));
  for (const args of [['--no-sandbox'], ['--no-sandbox', '--disable-brave-extension', '--disable-features=BraveShields,BraveHTTPSUpgrades']]) {
    const b = await chromium.launch({ executablePath: '/home/TWIG/.local/bin/chromium', args });
    const p = await (await b.newContext()).newPage();
    await p.goto('http://127.0.0.1:8096/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(args.length > 1 ? '[shields-off]' : '[default]', 'local-ws:', await tryWs(p, 'ws://127.0.0.1:18098/x'));
    console.log(args.length > 1 ? '[shields-off]' : '[default]', '127-vs-localhost:', await tryWs(p, 'ws://localhost:18098/x'));
    await b.close();
  }
  server.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
