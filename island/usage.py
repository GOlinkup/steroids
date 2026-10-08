"""Local usage ledger — port of vibe-notch-codex UsageAnalyticsEngine
(Apache-2.0): events + sessions + zero-filled daily buckets, hashed paths
(privacy: no conversation content, no raw cwd stored). Stdlib sqlite3.
"""
import hashlib
import json
import os
import sqlite3
import time
from datetime import date, timedelta

SCHEMA = """
CREATE TABLE IF NOT EXISTS usage_events(
  event_id INTEGER PRIMARY KEY, session_id TEXT, agent TEXT,
  occurred_at REAL, input INT DEFAULT 0, output INT DEFAULT 0,
  cache_read INT DEFAULT 0, cache_write INT DEFAULT 0, model TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS usage_sessions(
  session_id TEXT PRIMARY KEY, agent TEXT, project TEXT, model TEXT DEFAULT '',
  started_at REAL, ended_at REAL, input INT DEFAULT 0, output INT DEFAULT 0,
  cache_read INT DEFAULT 0, cache_write INT DEFAULT 0);
CREATE TABLE IF NOT EXISTS usage_files(
  path_hash TEXT PRIMARY KEY, mtime REAL, size INT);
CREATE INDEX IF NOT EXISTS idx_ev_day ON usage_events(agent, occurred_at);
CREATE INDEX IF NOT EXISTS idx_sess_day ON usage_sessions(agent, started_at);
"""

# $/1M tokens (input, output, cache_read, cache_write) — re-verify before billing.
PRICES = {
    'sonnet': (3.0, 15.0, 0.3, 3.75),
    'haiku': (0.8, 4.0, 0.1, 1.0),
    'opus': (15.0, 75.0, 1.5, 18.75),
    'gpt': (5.0, 15.0, 0.5, 3.75),
}


def h(path):
    return hashlib.sha256(str(path).encode()).hexdigest()[:32]


def _db(path=None):
    if path is None:
        home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
        path = os.path.join(home, '.config', 'steroids', 'usage.sqlite')
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    except OSError:
        pass
    c = sqlite3.connect(path, timeout=5)
    c.executescript(SCHEMA)
    return c


def _scanned(c, path):
    try:
        st = os.stat(path)
    except OSError:
        return False
    row = c.execute('SELECT mtime, size FROM usage_files WHERE path_hash=?',
                    (h(path),)).fetchone()
    if row and row[0] == st.st_mtime and row[1] == st.st_size:
        return True
    c.execute('REPLACE INTO usage_files VALUES (?,?,?)',
              (h(path), st.st_mtime, st.st_size))
    return False


def ingest_ledger(limit=1000, db=None):
    """Fold agent-events.jsonl into usage_events (idempotent per line #)."""
    import agentlog
    c = db or _db()
    try:
        evs = agentlog.read_events(limit=limit)
    except Exception:
        evs = []
    base = c.execute('SELECT COUNT(*) FROM usage_events').fetchone()[0]
    for i, e in enumerate(evs):
        c.execute('INSERT INTO usage_events(event_id, session_id, agent,'
                  ' occurred_at) VALUES (?,?,?,?)',
                  (base * 100000 + i, e.get('session'), e.get('agent'),
                   e.get('ts') or time.time()))
    c.commit()
    return len(evs)


def ingest_claude_jsonl(path, db=None):
    """Claude transcript -> token events (message.id deduped per run)."""
    import agentlog
    c = db or _db()
    if _scanned(c, path):
        c.commit()
        return 0
    totals = agentlog.transcript_usage(path)
    sid = os.path.splitext(os.path.basename(path))[0]
    proj = os.path.basename(os.path.dirname(os.path.dirname(path)))
    now = time.time()
    c.execute('INSERT INTO usage_sessions(session_id, agent, project,'
              ' started_at, ended_at, input, output, cache_read, cache_write)'
              ' VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE'
              ' SET ended_at=excluded.ended_at, input=excluded.input,'
              ' output=excluded.output',
              (sid, 'claude', proj, now, now, totals['input'],
               totals['output'], totals['cacheRead'], totals['cacheCreation']))
    c.commit()
    return totals['input'] + totals['output']


def daily_buckets(days=84, agent=None, db=None):
    """Zero-filled [{date, input, output}] oldest-first for heatmaps."""
    c = db or _db()
    today = date.today()
    out = [{'date': str(today - timedelta(days=i)), 'input': 0, 'output': 0}
           for i in range(days - 1, -1, -1)]
    idx = {b['date']: b for b in out}
    q = ('SELECT date(occurred_at, "unixepoch"), SUM(input), SUM(output)'
         ' FROM usage_events WHERE occurred_at > ?')
    args = [time.time() - days * 86400]
    if agent:
        q += ' AND agent=?'
        args.append(agent)
    q += ' GROUP BY 1'
    try:
        for d, i, o in c.execute(q, args):
            if d in idx:
                idx[d]['input'], idx[d]['output'] = i or 0, o or 0
    except Exception:
        pass
    return out


def cost_micros(model, inp, outp, cr=0, cw=0):
    """Estimated micro-dollars. Unknown model -> None (display '--')."""
    m = str(model or '').lower()
    key = next((k for k in PRICES if k in m), None)
    if key is None:
        return None
    pi, po, pr, pw = PRICES[key]
    return int((inp * pi + outp * po + cr * pr + cw * pw))
