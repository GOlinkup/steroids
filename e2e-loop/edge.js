// Edge battery: expiry, caps, malformed input, persistence, concurrency.
// Bridge must be up on 127.0.0.1:8096. Exit 1 on any FAIL.
const results = [];
const ok = (n, d) => { results.push([n, 1, d]); console.log('PASS ' + n + (d ? ' — ' + d : '')); };
const fail = (n, d) => { results.push([n, 0, d]); console.log('FAIL ' + n + ' — ' + d); };
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8096';
const J = async (method, path, body, raw) => {
  const r = await fetch(BASE + path, {
    method, headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : (body ? JSON.stringify(body) : undefined),
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  return { status: r.status, json: j, txt: txt.slice(0, 160) };
};
(async () => {
  // 1. bad PIN rejected, good PIN single-use (PIN replay must fail second time)
  const qr = (await J('GET', '/relay/qr')).json;
  const v1 = await J('POST', '/relay/verify', { pin: qr.pin });
  const v2 = await J('POST', '/relay/verify', { pin: qr.pin });
  (v1.json && v1.json.ok && v1.json.key && v2.json && !v2.json.ok)
    ? ok('pin-single-use', 'first ok, replay rejected') : fail('pin-single-use', JSON.stringify([v1.json, v2.json]));
  const vb = await J('POST', '/relay/verify', { pin: '0000' });
  (!vb.json.ok) ? ok('pin-bad', 'rejected') : fail('pin-bad', 'accepted?!');
  // upload abuse: traversal, spaces, dotfiles, double extensions sanitize
  const nasty = await (async () => {
    const out = [];
    for (const nm of ['../../x.sh', 'a b.png', 'x.png.exe', '.htaccess']) {
      const b64 = Buffer.from('z').toString('base64');
      const r = await J('POST', '/upload', { name: nm, data: b64 });
      const leaf = r.json && r.json.path ? r.json.path.split('/').pop() : '';
      out.push(r.status === 200 && !leaf.includes('..') && !leaf.includes(' ') && !leaf.startsWith('.'));
    }
    return out;
  })();
  nasty.every(Boolean) ? ok('upload-nasty', 'all sanitized') : fail('upload-nasty', nasty.join(','));

  // 2. link knock -> approve -> status -> replay pops once
  const knock = (await J('POST', '/relay/link-request', { label: 'e2e-phone' })).json;
  const pend = (await J('GET', '/relay/pending')).json;
  (knock.token && pend.pending.some(x => x.token === knock.token)) ? ok('link-knock', 'visible') : fail('link-knock', JSON.stringify(knock));
  const appr = await J('POST', '/relay/link-approve', { token: knock.token });
  const st1 = (await J('GET', '/relay/link-status?token=' + knock.token)).json;
  const st2 = (await J('GET', '/relay/link-status?token=' + knock.token)).json;
  (appr.json.ok && appr.json.key && st1.approved && st1.key && !st2.approved)
    ? ok('link-approve-once', 'key pops single-read') : fail('link-approve-once', JSON.stringify([appr.json, st1, st2]));
  // phone must stop its own turns/loops from LAN: DELETE is NOT localhost-gated
  // (regression: a merged handler once 403'd these — only hides are guarded).
  const mk = await J('POST', '/chat', { message: 'e2e lan-delete probe', provider: 'opencode' });
  if (mk.json && mk.json.ok) {
    const lanBase2 = ((await J('GET', '/relay/pending')).json || {}).lan || null;
    if (lanBase2) {
      let lanDel = { status: 0 };
      try {
        const r = await fetch(lanBase2 + '/turn?id=' + mk.json.turn, { method: 'DELETE' });
        lanDel = { status: r.status, json: await r.json().catch(() => null) };
      } catch (e) { lanDel = { status: -1 }; }
      (lanDel.status === 200 && lanDel.json && lanDel.json.ok)
        ? ok('turn DELETE from LAN', '200, phone can stop turns') : fail('turn DELETE from LAN', String(lanDel.status));
    } else ok('turn DELETE from LAN', 'SKIP — no LAN base');
    await J('DELETE', '/turn?id=' + mk.json.turn);
  } else fail('turn DELETE from LAN', 'setup turn failed');
  // link-approve from LAN must stay refused (localhost-only guard).
  const lanBase = ((await J('GET', '/relay/pending')).json || {}).lan || BASE;
  const lanAppr = await (async () => {
    try {
      const r = await fetch(lanBase + '/relay/link-approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'x' }) });
      return r.status;
    } catch (e) { return 'unreachable:' + e.cause?.code; }
  })();
  (lanAppr === 403) ? ok('link-approve-local-only', '403 from LAN') : fail('link-approve-local-only', String(lanAppr));

  // 3. malformed bodies never crash
  for (const [m, p, raw] of [['POST', '/chat', '{nope'], ['POST', '/decide', '[1,2'], ['POST', '/upload', 'zzzz'], ['POST', '/handoff', '']]) {
    try {
      const r = await J(m, p, undefined, raw);
      ([400, 404].includes(r.status)) ? ok(`badbody ${m} ${p}`, String(r.status)) : fail(`badbody ${m} ${p}`, r.status + ' ' + r.txt);
    } catch (e) { fail(`badbody ${m} ${p}`, 'threw: ' + e.message); }
  }
  // unknown session -> idle progress (never another session's data); empty -> 400
  const su = await J('GET', '/session?session=e2e-nope');
  const stask = su.json && su.json.progress;
  (su.status === 200 && stask && !stask.task && stask.state === 'idle') ? ok('session-unknown', 'idle, no leak') : fail('session-unknown', su.status + ' ' + su.txt);
  const se = await J('GET', '/session?session=');
  (se.status === 400) ? ok('session-empty', '400, no leak') : fail('session-empty', se.status + ' ' + se.txt);
  // oversize chat body
  const big = await J('POST', '/chat', undefined, 'x'.repeat(70000));
  (big.status === 400) ? ok('chat-oversize', '400') : fail('chat-oversize', big.status);

  // 4. unknown provider + empty message
  const unk = await J('POST', '/chat', { message: 'hi', provider: 'nope' });
  (!unk.json.ok) ? ok('chat-unknown-provider', 'refused') : fail('chat-unknown-provider', 'accepted?!');
  const emp = await J('POST', '/chat', { message: '  ' });
  (emp.status === 400) ? ok('chat-empty', '400') : fail('chat-empty', emp.status);

  // 5. decisions TTL: seed expired row, must be swept (not pending)
  const { execFileSync } = require('child_process');
  execFileSync('python3', ['-c', `import sys,time,json,os;sys.path.insert(0,'island');import decisions;
d=decisions._load();d['e2e-old']={'session':'e2e','ts':time.time()-999,'expires':time.time()-10};decisions._save(d)`], { cwd: '/home/TWIG/steroids' });
  const pnd = (await J('GET', '/pending')).json;
  (Array.isArray(pnd.pending) && !pnd.pending.some(x => x.key === 'e2e-old')) ? ok('decisions-ttl', 'expired swept') : fail('decisions-ttl', 'stale row visible');

  // 6. concurrency: 20 parallel health + sessions
  const par = await Promise.all(Array.from({ length: 20 }, (_, i) => J('GET', i % 2 ? '/health' : '/sessions')));
  par.every(r => r.status === 200) ? ok('concurrency-20', 'all 200') : fail('concurrency-20', par.map(r => r.status).join(','));

  // 7. gigs validation
  const g1 = await J('POST', '/gigs/add', { title: '', pay_cents: 'x' });
  (g1.status === 400) ? ok('gigs-invalid', '400') : fail('gigs-invalid', g1.status);
  const g2 = await J('POST', '/gigs/add', { title: 'e2e gig', pay_cents: 500, category: 'test' });
  (g2.json && g2.json.ok && g2.json.id) ? ok('gigs-add', 'id ' + g2.json.id) : fail('gigs-add', JSON.stringify(g2.json));
  // gigs persist file-backed; scrub our test row so the repo stays clean
  try {
    const { execFileSync } = require('child_process');
    const left = execFileSync('python3', ['-c', `import json,os;p='/home/TWIG/steroids/island/gigs_native.json';
d=json.load(open(p)) if os.path.exists(p) else [];d=[r for r in d if r.get('title')!='e2e gig'];
json.dump(d,open(p,'w')) if (d or os.path.exists(p)) else None;
import os as _o;_o.remove(p) if not d and _o.path.exists(p) else None;print(len(d))`], { encoding: 'utf8' }).trim();
    ok('gigs-cleanup', left + ' rows left');
  } catch (e) { fail('gigs-cleanup', e.message); }

  // 8. focus unknown session
  const fo = await J('POST', '/focus', { session: 'e2e-nope' });
  (fo.status === 404) ? ok('focus-unknown', '404') : fail('focus-unknown', fo.status);

  require('fs').writeFileSync(__dirname + '/edge-results.json', JSON.stringify(results, null, 1));
  const fails = results.filter(r => !r[1]);
  console.log(`\n${results.length - fails.length}/${results.length} pass`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('EDGE-CRASH', e.message); process.exit(2); });
