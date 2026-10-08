"""Hook-free session discovery — port of agent-isle readers (MIT).

Reads each tool's own store directly: zero setup monitoring for agents
with no hooks installed. All read-only, all bounded, never throws.
Returns [{'session', 'ts', 'agent', 'first'}] like agentlog sessions.
"""
import glob
import json
import os
import sqlite3
import time

ACTIVE_WINDOW = 30 * 60  # only sessions touched in the last 30 min
CAP = 10


def _fresh(path):
    try:
        return time.time() - os.path.getmtime(path) < ACTIVE_WINDOW
    except OSError:
        return False


def _text_of(content):
    """Grok-style content: str or list of blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        bits = []
        for b in content:
            if isinstance(b, dict) and isinstance(b.get('text'), str):
                bits.append(b['text'])
            elif isinstance(b, str):
                bits.append(b)
        return ''.join(bits)
    return ''


def cursor_sessions(limit=CAP):
    """Cursor CLI chats: ~/.cursor/chats/*/<uuid>/store.db (meta + blobs)."""
    out = []
    try:
        dbs = glob.glob(os.path.expanduser('~/.cursor/chats/*/store.db'))
    except Exception:
        return []
    for db in sorted(dbs, key=_fresh_mtime, reverse=True)[:limit * 2]:
        if not _fresh(db):
            continue
        try:
            c = sqlite3.connect('file:%s?mode=ro' % db.replace('%', '%25'),
                                uri=True, timeout=1)
        except Exception:
            continue
        try:
            row = c.execute(
                "SELECT value FROM meta WHERE key='0'").fetchone()
            if not row:
                continue
            raw = row[0]
            if isinstance(raw, bytes):
                try:
                    raw = bytes.fromhex(raw.decode()).decode('utf-8', 'replace')
                except (ValueError, UnicodeDecodeError):
                    raw = raw.decode('utf-8', 'replace')
            meta = json.loads(raw)
            first = meta.get('name') or '?'
            try:
                blobs = c.execute(
                    'SELECT data FROM blobs ORDER BY rowid DESC LIMIT 60'
                ).fetchall()
                for (data,) in blobs:
                    try:
                        m = json.loads(data) if isinstance(data, str) else {}
                    except ValueError:
                        continue
                    t = _text_of((m.get('message') or {}).get('content')
                                 or m.get('content') or '')
                    if t.strip() and m.get('role') == 'user':
                        first = t.strip().splitlines()[0][:60]
                        break
            except Exception:
                pass
            sid = os.path.basename(os.path.dirname(db))
            out.append({'session': sid, 'ts': os.path.getmtime(db),
                        'agent': 'cursor', 'first': str(first)[:60]})
        except Exception:
            continue
        finally:
            try:
                c.close()
            except Exception:
                pass
        if len(out) >= limit:
            break
    return out


def _fresh_mtime(p):
    try:
        return os.path.getmtime(p)
    except OSError:
        return 0


def grok_sessions(limit=CAP):
    """Grok CLI: ~/.grok/sessions/<cwd>/<uuid>/chat_history.jsonl."""
    out = []
    try:
        files = glob.glob(os.path.expanduser(
            '~/.grok/sessions/*/*/chat_history.jsonl'))
    except Exception:
        return []
    for p in sorted(files, key=_fresh_mtime, reverse=True)[:limit * 2]:
        if not _fresh(p):
            continue
        first = '?'
        try:
            with open(p, encoding='utf-8') as f:
                for ln in f.read().splitlines()[:200]:
                    try:
                        m = json.loads(ln.strip())
                    except ValueError:
                        continue
                    if m.get('type') == 'user' and _text_of(
                            m.get('content')).strip():
                        first = _text_of(m['content']).strip().splitlines()[0][:60]
                        break
        except OSError:
            continue
        out.append({'session': 'grok:' + os.path.basename(os.path.dirname(p)),
                    'ts': os.path.getmtime(p), 'agent': 'grok',
                    'first': first})
        if len(out) >= limit:
            break
    return out


def copilot_sessions(limit=CAP):
    """Copilot CLI: ~/.copilot/history-session-state/session_*.json."""
    out = []
    try:
        files = glob.glob(os.path.expanduser(
            '~/.copilot/history-session-state/session_*.json'))
    except Exception:
        return []
    for p in sorted(files, key=_fresh_mtime, reverse=True)[:limit * 2]:
        if not _fresh(p):
            continue
        try:
            with open(p, encoding='utf-8') as f:
                d = json.load(f)
        except (OSError, ValueError):
            continue
        first = '?'
        for m in (d.get('chatMessages') or [])[:20]:
            if m.get('role') == 'user' and str(m.get('content') or '').strip():
                first = str(m['content']).strip().splitlines()[0][:60]
                break
        out.append({'session': str(d.get('sessionId') or os.path.basename(p)),
                    'ts': os.path.getmtime(p), 'agent': 'copilot',
                    'first': first})
        if len(out) >= limit:
            break
    return out


def all_extra(limit=CAP):
    """Every hook-free source in one call (dedup by session id)."""
    seen, out = set(), []
    for fn in (cursor_sessions, grok_sessions, copilot_sessions):
        for s in fn(limit=limit):
            if s['session'] not in seen:
                seen.add(s['session'])
                out.append(s)
    return sorted(out, key=lambda s: s['ts'], reverse=True)[:limit]
