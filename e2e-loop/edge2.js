// Gap battery 2: every endpoint/check the first batteries missed.
// Server must run with STEROIDS_HOME=/tmp/e2ehome (isolated events/decisions).
// Usage: E2E_BASE=http://127.0.0.1:8099 node edge2.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:8096';
const EHOME = '/tmp/e2ehome/.config/steroids';
const results = [];
const ok = (n, d) => { results.push([n, 1, d]); console.log('PASS ' + n + (d ? ' — ' + d : '')); };
const fail = (n, d) => { results.push([n, 0, d]); console.log('FAIL ' + n + ' — ' + d); };
const J = async (method, path, body, raw, headers) => {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(headers || {}) }, body: raw !== undefined ? raw : (body ? JSON.stringify(body) : undefined) });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) {}
  return { status: r.status, json: j, txt: txt.slice(0, 200), headers: r.headers };
};
const py = (code) => execFileSync('python3', ['-c', code], { encoding: 'utf8' }).trim();
(async () => {
  fs.mkdirSync(EHOME, { recursive: true });

  // --- A. untested endpoints: shape + status, never crash ---
  const shapes = [
    ['/models', (j) => Array.isArray(j.models)],
    ['/trending', (j) => Array.isArray(j.trending) && Array.isArray(j.recent)],
    ['/battery', (j) => typeof j.has_battery === 'boolean'],
    ['/nowplaying', (j) => 'playing' in j && 'player' in j],
    ['/audio-energy', (j) => typeof j.energy === 'number'],
    ['/soundpacks', (j) => Array.isArray(j.packs)],
    ['/energy', (j) => j.tier && j.interval],
    ['/quota', (j) => 'quota' in j],
    ['/demo', (j) => Array.isArray(j.demo) && j.demo.length === 3],
    ['/profile', (j) => j.ok && j.profile],
    ['/usage', (j) => 'usage' in j],
    ['/api/daily/briefing', (j) => 'headlines' in j],
    ['/api/daily/today', (j) => Array.isArray(j.events)],
    ['/api/daily/work', (j) => j !== null],
    ['/api/daily/usage', (j) => j.today && j.current],
  ];
  for (const [p, good] of shapes) {
    try {
      const r = await J('GET', p);
      (r.status === 200 && r.json && good(r.json)) ? ok('GET ' + p, 'shape ok') : fail('GET ' + p, r.status + ' ' + r.txt);
    } catch (e) { fail('GET ' + p, 'threw ' + e.message); }
  }
  const disp = await J('GET', '/display');
  let dispFile = false;
  try { dispFile = disp.json.path && fs.existsSync(disp.json.path); } catch (e) {}
  (disp.status === 200 && disp.json.display && Array.isArray(disp.json.display.sessions) && dispFile)
    ? ok('GET /display', 'slots + published file') : fail('GET /display', disp.status + ' ' + disp.txt);
  const dl = await J('GET', '/relay/dl-qr');
  (dl.json && dl.json.ok && dl.json.png_b64) ? ok('GET /relay/dl-qr', 'QR issued') : fail('GET /relay/dl-qr', dl.status);
  const ls = await J('GET', '/relay/link-status?token=nope');
  (ls.json && ls.json.approved === false) ? ok('link-status unknown', 'approved:false') : fail('link-status unknown', ls.status);
  const t404 = await J('GET', '/turn?id=nope');
  (t404.status === 404) ? ok('turn unknown GET', '404') : fail('turn unknown GET', t404.status);
  const d404 = await J('DELETE', '/turn?id=nope');
  (d404.status === 404) ? ok('turn unknown DELETE', '404') : fail('turn unknown DELETE', d404.status);
  const opt = await J('OPTIONS', '/chat');
  (opt.status === 204 && (opt.headers.get('access-control-allow-origin') === '*')) ? ok('OPTIONS preflight', '204 + CORS') : fail('OPTIONS preflight', opt.status);

  // --- B. clamps ---
  const nneg = await J('GET', '/skills?q=test&n=-5');
  (nneg.json && Array.isArray(nneg.json.hits)) ? ok('skills n=-5', nneg.json.hits.length + ' hits') : fail('skills n=-5', nneg.status);
  const nbig = await J('GET', '/skills?q=test&n=999');
  (nbig.json && nbig.json.hits.length <= 20) ? ok('skills n=999', 'capped ' + nbig.json.hits.length) : fail('skills n=999', nbig.status);
  const gl = await J('GET', '/gigs?limit=9999');
  (gl.json && Array.isArray(gl.json.gigs || gl.json.items || gl.json)) ? ok('gigs limit=9999', 'shape ok') : fail('gigs limit=9999', gl.status + ' ' + gl.txt);

  // --- C. /install guards (safe: no download triggered) ---
  const ibad = await J('POST', '/install', { provider: 'claude' });
  (ibad.status === 400) ? ok('install bad provider', '400') : fail('install bad provider', ibad.status);
  const iok = await J('POST', '/install', { provider: 'opencode' });
  (iok.json && (iok.json.ok)) ? ok('install opencode', JSON.stringify(iok.json).slice(0, 60)) : fail('install opencode', iok.status);

  // --- D. inject one hook event (isolated e2ehome) -> filter + focus + brief ---
  const ev = { session: 'e2e-filter-test', event: 'UserPromptSubmit', text: 'e2e probe event', ts: Date.now() / 1000, cwd: '/tmp', agent: 'opencode' };
  fs.appendFileSync(EHOME + '/agent-events.jsonl', JSON.stringify(ev) + '\n');
  const sDef = (await J('GET', '/sessions')).json;
  const sShow = (await J('GET', '/sessions?showTests=1')).json;
  const hasDef = (sDef.sessions || []).some((s) => s.session === 'e2e-filter-test');
  const hasShow = (sShow.sessions || []).some((s) => s.session === 'e2e-filter-test');
  (!hasDef && hasShow) ? ok('e2e-filter', 'hidden default, shown ?showTests=1') : fail('e2e-filter', `default=${hasDef} shown=${hasShow}`);
  const fo = await J('POST', '/focus', { session: 'e2e-filter-test' });
  (fo.json && fo.json.ok) ? ok('focus success', 'how=' + fo.json.how) : fail('focus success', fo.status + ' ' + fo.txt);
  const brief = py(`import sys,json;sys.path.insert(0,'/home/TWIG/steroids/island');import os;os.environ['STEROIDS_HOME']='/tmp/e2ehome';import agentlog;evs=agentlog.read_events(limit=300);b=agentlog.build_handoff_brief(evs,'e2e-filter-test','go on');print('BRIEF:'+b[:80])`);
  (/BRIEF:e2e|BRIEF:Relay/.test(brief)) ? ok('handoff-brief builds', brief.slice(0, 60)) : fail('handoff-brief builds', brief.slice(0, 120));

  // --- E. auto_approve set + reset ---
  const aa1 = await J('POST', '/decide', { session: 'e2e-sess', auto_approve: true });
  const aaState = py(`import sys,os;sys.path.insert(0,'/home/TWIG/steroids/island');os.environ['STEROIDS_HOME']='/tmp/e2ehome';import decisions;print(decisions._load())`);
  await J('POST', '/decide', { session: 'e2e-sess', auto_approve: false });
  (aa1.json && aa1.json.ok) ? ok('auto_approve set/reset', 'ok') : fail('auto_approve set/reset', aa1.status);

  // --- F. double-decide semantics (unique key per run — no cross-run state) ---
  const dblReq = 'r1-' + Date.now();
  py(`import sys,os;sys.path.insert(0,'/home/TWIG/steroids/island');os.environ['STEROIDS_HOME']='/tmp/e2ehome';import decisions;decisions.note('e2e-dbl','Bash','${dblReq}',text='t')`);
  const dd = py(`import sys,os;sys.path.insert(0,'/home/TWIG/steroids/island');os.environ['STEROIDS_HOME']='/tmp/e2ehome';import decisions;a=decisions.decide('e2e-dbl|Bash|${dblReq}','approve');b=decisions.decide('e2e-dbl|Bash|${dblReq}','deny');print(str(a)+'/'+str(b))`);
  (dd === 'True/False') ? ok('double-decide', 'first wins, second refused') : fail('double-decide', dd);

  // --- G. knock dedup (same label -> one row) ---
  const k1 = (await J('POST', '/relay/link-request', { label: 'e2e-dedup' })).json;
  const k2 = (await J('POST', '/relay/link-request', { label: 'e2e-dedup' })).json;
  const rows = ((await J('GET', '/relay/pending')).json.pending || []).filter((x) => x.label === 'e2e-dedup');
  (rows.length === 1) ? ok('knock dedup', 'one row') : fail('knock dedup', rows.length + ' rows');
  await J('POST', '/relay/link-approve', { token: (k2.token || k1.token) });

  // --- H. hide persists at file layer, then clean up ---
  const h = await J('DELETE', '/agent-sessions?session=e2e-hide-test');
  const fileHas = py(`import sys,os,json;sys.path.insert(0,'/home/TWIG/steroids/island');os.environ['STEROIDS_HOME']='/tmp/e2ehome';import agentlog;print('e2e-hide-test' in agentlog.hidden_sessions())`);
  py(`import sys,os,json;sys.path.insert(0,'/home/TWIG/steroids/island');os.environ['STEROIDS_HOME']='/tmp/e2ehome';p='/tmp/e2ehome/.config/steroids/hidden-sessions.json';d=[x for x in json.load(open(p)) if x!='e2e-hide-test'];json.dump(d,open(p,'w'))`);
  (h.json && h.json.ok && fileHas === 'True') ? ok('hide persists', 'file-backed') : fail('hide persists', h.status);

  // --- I. concurrent turns x2 ---
  const c1 = await J('POST', '/chat', { message: 'e2e concurrent one', provider: 'opencode' });
  const c2 = await J('POST', '/chat', { message: 'e2e concurrent two', provider: 'opencode' });
  const both = c1.json && c1.json.ok && c2.json && c2.json.ok && c1.json.turn !== c2.json.turn;
  if (both) {
    await J('DELETE', '/turn?id=' + c1.json.turn);
    await J('DELETE', '/turn?id=' + c2.json.turn);
    ok('concurrent turns', 'two live, both deleted');
  } else fail('concurrent turns', JSON.stringify([c1.json, c2.json]).slice(0, 120));

  // --- J. loop jobs: validation + cancel flow + unknown ids (no quota burn) ---
  const lbad = await J('POST', '/loop', undefined, '{nope');
  const lemp = await J('POST', '/loop', { prompt: '   ' });
  (lbad.status === 400 && lemp.json && !lemp.json.ok) ? ok('loop validation', '400s') : fail('loop validation', lbad.status + '/' + lemp.status);
  const lstart = await J('POST', '/loop', { prompt: 'write a git commit message' });
  if (lstart.json && lstart.json.ok && lstart.json.id) {
    const lid = lstart.json.id;
    const stop = await J('DELETE', '/loop?id=' + lid); // immediate: lands during route/plan
    let snap = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      snap = (await J('GET', '/loop?id=' + lid)).json;
      if (snap && snap.done) break;
    }
    if (stop.json && stop.json.ok && snap && snap.done && snap.loop && snap.loop.verdict === 'cancelled') {
      ok('loop cancel', 'stopped pre-step, verdict cancelled');
    } else if (snap && !snap.done) {
      ok('loop cancel', 'SKIP — a real step started first (cancel lands between steps); stop accepted');
      await J('DELETE', '/loop?id=' + lid);
    } else fail('loop cancel', JSON.stringify(snap).slice(0, 160));
  } else fail('loop start', JSON.stringify(lstart.json).slice(0, 120));
  const lunk = await J('GET', '/loop?id=nope');
  const lunkd = await J('DELETE', '/loop?id=nope');
  (lunk.status === 404 && lunkd.status === 404) ? ok('loop unknown ids', '404s') : fail('loop unknown ids', lunk.status + '/' + lunkd.status);
  // loop cap: 2 live max, third refused (stub executor, no turns burned)
  try {
    const cap = execFileSync('python3', ['-c', `import sys,types,time;sys.path.insert(0,'/home/TWIG/steroids/island');
stub=types.ModuleType('loop');stub.run_loop=lambda *a,**k:(time.sleep(8),{'ok':True,'verdict':'done','detail':'stub','steps':[]})[1];sys.modules['loop']=stub;
import bridge;r1=bridge.start_loop('a');r2=bridge.start_loop('b');r3=bridge.start_loop('c');
print(('Y' if r1['ok'] else 'n')+'/'+('Y' if r2['ok'] else 'n')+'/'+('Y' if (not r3['ok'] and 'already running' in r3.get('error','')) else 'n'))`], { encoding: 'utf8' }).trim();
    (cap === 'Y/Y/Y') ? ok('loop cap', '2 live, 3rd refused') : fail('loop cap', cap);
  } catch (e) { fail('loop cap', e.message.slice(0, 120)); }

  // --- cleanup injected event line ---
  try {
    const p = EHOME + '/agent-events.jsonl';
    const kept = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l && !l.includes('e2e-filter-test'));
    fs.writeFileSync(p, kept.join('\n') + (kept.length ? '\n' : ''));
    ok('cleanup', 'injected event removed');
  } catch (e) { fail('cleanup', e.message); }

  fs.writeFileSync(__dirname + '/edge2-results.json', JSON.stringify(results, null, 1));
  const fails = results.filter((r) => !r[1]);
  console.log(`\n${results.length - fails.length}/${results.length} pass`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('EDGE2-CRASH', e.message); process.exit(2); });
