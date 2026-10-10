// Minimal WS acceptor (raw socket, canned 101) vs real bridge: isolate the failure.
const { chromium } = require('playwright-core');
const net = require('net');
const crypto = require('crypto');

const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    const s = buf.toString('latin1');
    if (!s.includes('\r\n\r\n')) return;
    const m = s.match(/Sec-WebSocket-Key: (\S+)/);
    const accept = crypto.createHash('sha1').update(m[1] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    console.log('minimal-srv: got handshake, sending 101');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  });
});

(async () => {
  await new Promise(r => server.listen(18099, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: '/home/TWIG/.local/bin/chromium', args: ['--no-sandbox'] });
  const p = await (await b.newContext()).newPage();
  await p.goto('http://127.0.0.1:8096/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const out = await p.evaluate(() => new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:18099/x');
    const t = setTimeout(() => res('timeout state=' + ws.readyState), 6000);
    ws.onopen = () => { clearTimeout(t); res('OPEN'); ws.close(); };
    ws.onclose = (e) => { clearTimeout(t); res('CLOSE ' + e.code); };
  }));
  console.log('minimal-ws:', out);
  await b.close();
  server.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(2); });
