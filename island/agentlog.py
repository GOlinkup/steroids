"""Agent event ledger for the Steroids island (stdlib only).

Claude Code and OpenCode report what they are doing through hook events;
this module normalizes those into ONE ndjson log and turns the log back
into the things the island UI needs:

  - live state        idle | thinking | working | finished | error
  - activity line     "Edit app.py +12 -3"
  - transcript        user bubbles / agent bubbles / file edits, by session

Everything survives reboots (files, not RAM). Never throws on data.
"""
import json
import os
import sqlite3
import time

# --- storage (same live dirs app.py uses for served.jsonl) ---------------

def live_dir():
    home = os.environ.get('STEROIDS_HOME') or os.path.expanduser('~')
    for d in (os.path.join(home, '.config', 'steroids'),
              os.path.join(home, '.config', 'opencode', 'plugins', 'steroids')):
        if os.path.isdir(d):
            return d
    p = os.path.join(home, '.config', 'steroids')
    try:
        os.makedirs(p, exist_ok=True)
    except OSError:
        pass
    return p


def events_path():
    return os.path.join(live_dir(), 'agent-events.jsonl')


def chat_path():
    return os.path.join(live_dir(), 'agent-chat.jsonl')


FILE_TOOLS = ('Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'edit', 'write')
STATES = ('idle', 'thinking', 'working', 'finished', 'error')

# --- normalize: provider payloads -> ledger dicts -------------------------

def _tool_lines(inp, ev):
    """(added, removed) for file tools; tolerant to absent fields."""
    if not isinstance(inp, dict):
        return 0, 0
    if ev != 'PostToolUse':
        return 0, 0
    old = str(inp.get('old_string') or '')
    new = str(inp.get('new_string') or '')
    if inp.get('edits'):  # MultiEdit: aggregate
        try:
            added = removed = 0
            for e in inp['edits']:
                removed += (str(e.get('old_string') or '').count('\n') + 1)
                added += (str(e.get('new_string') or '').count('\n') + 1)
            return added, removed
        except Exception:
            return 0, 0
    if new and old:
        return new.count('\n') + 1, old.count('\n') + 1
    if new and not old:
        return new.count('\n') + 1, 0  # Write
    return 0, 0


def normalize_claude(p, agent='claude'):
    ev = p.get('hook_event_name') or p.get('event') or ''
    tool = p.get('tool_name') or p.get('tool') or ''
    inp = p.get('tool_input') if isinstance(p.get('tool_input'), dict) else {}
    added, removed = _tool_lines(inp, ev)
    ev_map = {
        'SessionStart': 'SessionStart', 'UserPromptSubmit': 'UserPromptSubmit',
        'PreToolUse': 'PreToolUse', 'PostToolUse': 'PostToolUse',
        'PermissionRequest': 'PreToolUse', 'Notification': 'Notification',
        'Stop': 'Stop',
        'StopFailure': 'Stop', 'SessionEnd': 'SessionEnd',
        'SubagentStart': 'SubagentStart', 'SubagentStop': 'SubagentStop',
    }
    ev = ev_map.get(ev, ev)
    if ev not in ('SessionStart', 'UserPromptSubmit', 'PreToolUse',
                  'PostToolUse', 'Notification', 'Stop', 'SessionEnd',
                  'SubagentStart', 'SubagentStop'):
        return None
    e = {
        'ts': p.get('ts') or time.time(),
        'event': ev,
        'tool': tool if ev in ('PreToolUse', 'PostToolUse') else '',
        'file': (inp.get('file_path') or inp.get('notebook_path') or '')
                if isinstance(inp, dict) else '',
        'added': added,
        'removed': removed,
        'text': str(p.get('prompt') or p.get('message') or '')[:600],
        'session': str(p.get('session_id') or '')[:64],
        'ok': bool(p.get('ok', ev != 'StopFailure')),
        'agent': agent,
    }
    # terminal context rides along when the relay captured it (focus jump-back)
    for k in ('cwd', 'tmux', 'tmux_server', 'term_program', 'tty',
              'term_pid', 'ssh', 'title_hint'):
        if p.get(k):
            e[k] = str(p[k])[:128]
    if p.get('hook_event_name') == 'PermissionRequest':
        e['attention'] = True
    if agent == 'codex' and ev == 'PreToolUse':
        # Codex owns its approval UI; the island surfaces but never blocks.
        e['notify_only'] = True
    return e


def normalize_opencode(p, agent='opencode'):
    """Our steroids-events.ts plugin sends {'kind': ...} payloads.

    kind: prompt | tool-before | tool-after | done | error
    """
    kind = p.get('kind') or ''
    m = {'prompt': 'UserPromptSubmit', 'tool-before': 'PreToolUse',
         'tool-after': 'PostToolUse', 'done': 'Stop', 'error': 'Stop'}
    if kind == 'error':
        p = dict(p, ok=False)
    ev = m.get(kind)
    if not ev:
        return None
    e = {
        'ts': p.get('ts') or time.time(),
        'event': ev,
        'tool': str(p.get('tool') or ''),
        'file': str(p.get('file') or ''),
        'added': int(p.get('added') or 0),
        'removed': int(p.get('removed') or 0),
        'text': str(p.get('text') or '')[:600],
        'session': str(p.get('session') or '')[:64],
        'ok': bool(p.get('ok', True)),
        'agent': agent,
    }
    for k in ('cwd', 'tmux', 'term_program', 'tty'):
        if p.get(k):
            e[k] = str(p[k])[:128]
    return e


def normalize(p, agent='claude'):
    """Any registered client -> ledger dict. Claude-protocol agents
    (gemini/qwen/kimi/codex/cursor/...) share normalize_claude; the
    agent tag is preserved so the island can brand per client."""
    if not isinstance(p, dict):
        return None
    try:
        import clients as _clients
        kind = _clients.get(agent)['kind']
    except Exception:
        kind = 'claude' if not p.get('kind') else 'opencode'
    if kind == 'opencode' or p.get('kind'):
        return normalize_opencode(p, agent if agent != 'claude' else 'opencode')
    return normalize_claude(p, agent or 'claude')

# --- append / read ---------------------------------------------------------

MAXBytes_EVENT_FILE = 2_000_000
KEEP_LINES = 1000


def append_event(e, path=None):
    path = path or events_path()
    try:
        d = os.path.dirname(path)
        if not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        if os.path.isfile(path) and os.path.getsize(path) > MAXBytes_EVENT_FILE:
            with open(path, 'rb') as f:
                lines = f.read().decode('utf-8', 'replace').splitlines()
            with open(path, 'w', encoding='utf-8') as f:
                f.write('\n'.join(lines[-KEEP_LINES:]) + '\n')
        with open(path, 'a', encoding='utf-8') as f:
            f.write(json.dumps(e, ensure_ascii=False) + '\n')
    except OSError:
        pass
    return e


def read_events(limit=300, path=None):
    path = path or events_path()
    try:
        with open(path, 'rb') as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 262144))
            lines = f.read().decode('utf-8', 'replace').splitlines()
    except OSError:
        return []
    out = []
    for ln in lines[-max(1, limit):]:
        ln = ln.strip()
        if not ln:
            continue
        try:
            e = json.loads(ln)
        except ValueError:
            continue
        if isinstance(e, dict):
            out.append(e)
    return out

# --- state / activity / transcript ----------------------------------------

_ORDER = {'idle': 0, 'SessionStart': 1, 'Notification': 1, 'UserPromptSubmit': 2,
          'thinking': 2, 'PreToolUse': 3, 'PostToolUse': 3, 'working': 3,
          'SubagentStart': 3, 'SubagentStop': 3}


def latest(evs):
    """(state, activity) from the newest events. Simple: last meaningful wins."""
    state, activity = 'idle', ''
    for e in reversed(evs):
        ev = e.get('event') or ''
        tool = e.get('tool') or ''
        f = e.get('file') or ''
        if ev in ('SessionEnd',):
            continue
        if ev == 'Stop':
            activity = 'finished ✓' if e.get('ok', True) else 'finished ✗ error'
            state = 'finished' if e.get('ok', True) else 'error'
            break
        if ev in ('PreToolUse', 'PostToolUse'):
            act = tool or 'tool'
            if f:
                act += ' ' + os.path.basename(f)
            if tool in FILE_TOOLS and (e.get('added') or e.get('removed')):
                act = ('Edit' if 'edit' in tool.lower() else 'Write') \
                    + (' ' + os.path.basename(f) if f else '')
                act += ' +%d -%d' % (e.get('added') or 0, e.get('removed') or 0)
            elif f:
                act += ' 📄'
            activity = '· ' + act + (' (failed)' if ev == 'PostToolUse'
                                     and not e.get('ok', True) else '')
            state = 'working'
            break
        if ev == 'UserPromptSubmit':
            t = (e.get('text') or '').strip()
            activity = ('· ' + t[:44] + '…') if len(t) > 46 else ('· ' + t if t else 'thinking')
            state = 'thinking'
            break
        if ev in ('SessionStart', 'Notification', 'SubagentStart', 'SubagentStop'):
            activity = '· ' + (tool or ev)
            state = state or 'idle'
            break
    return state, activity


def work_today(evs=None, now=None):
    """Today's work snapshot for the Daily grid: what/where/%/left.

    asks = UserPromptSubmits, done = Stops (clamped), left = asks - done,
    pct = done/asks. current = newest prompt text. Never throws."""
    try:
        now = now or time.time()
        day = time.strftime('%Y-%m-%d', time.localtime(now))
        evs = read_events(limit=2000) if evs is None else evs
        state, activity = latest(evs)
        asks, dones, files, added, removed = 0, 0, set(), 0, 0
        current = ''
        for e in evs:
            try:
                ts = e.get('ts') or 0
            except AttributeError:
                continue
            if not ts or time.strftime('%Y-%m-%d',
                                       time.localtime(ts)) != day:
                continue
            ev = e.get('event') or ''
            if ev == 'UserPromptSubmit':
                asks += 1
                if e.get('text'):
                    # first line only: pasted blobs stay a readable headline
                    first = str(e['text']).strip().splitlines()
                    current = (first[0] if first else '')[:140]
            elif ev == 'Stop':
                dones += 1
            elif ev in ('PreToolUse', 'PostToolUse'):
                if e.get('file'):
                    files.add(os.path.basename(e['file']))
                added += e.get('added') or 0
                removed += e.get('removed') or 0
        done = min(dones, asks)
        left = asks - done
        return {'state': state, 'activity': activity,
                'current': current, 'asks': asks,
                'done': done, 'left': left,
                'pct': round(done * 100 / asks) if asks else 0,
                'files': sorted(files)[:8], 'added': added,
                'removed': removed}
    except Exception:
        return {'state': 'idle', 'activity': '', 'current': '',
                'asks': 0, 'done': 0, 'left': 0, 'pct': 0,
                'files': [], 'added': 0, 'removed': 0}


def transcript(evs):
    """All events -> ordered UI items with role: user|agent|system."""
    items = []
    for e in evs:
        ev = e.get('event') or ''
        if ev == 'UserPromptSubmit' and e.get('text'):
            items.append({'role': 'user', 'text': e['text'],
                          'ts': e.get('ts'), 'session': e.get('session'),
                          'agent': e.get('agent')})
        elif ev in ('PreToolUse', 'PostToolUse'):
            tool = e.get('tool') or 'tool'
            f = os.path.basename(e.get('file') or '')
            if tool in FILE_TOOLS and (e.get('added') or e.get('removed')):
                line = '%s %s +%d -%d' % (tool, f, e.get('added') or 0,
                                          e.get('removed') or 0)
            elif f:
                line = '%s %s' % (tool, f)
            else:
                line = tool
            items.append({'role': 'agent', 'text': line, 'ts': e.get('ts'),
                          'session': e.get('session'), 'agent': e.get('agent'),
                          'kind': 'tool'})
        elif ev == 'Stop':
            items.append({'role': 'agent',
                          'text': 'finished ✓' if e.get('ok', True) else 'failed ✗',
                          'ts': e.get('ts'), 'session': e.get('session'),
                          'agent': e.get('agent'), 'kind': 'status'})
    return items


def sessions(evs, limit=12):
    """Distinct session ids, newest first, with a one-line summary."""
    out = []
    seen = {}
    for e in reversed(evs):
        sid = e.get('session') or ''
        if not sid:
            continue
        if sid in seen:
            continue
        seen[sid] = True
        first = (e.get('text') or e.get('tool') or e.get('event') or '?')
        out.append({'session': sid, 'ts': e.get('ts'), 'agent': e.get('agent'),
                    'first': str(first)[:60]})
        if len(out) >= limit:
            break
    return out

# --- hidden agent sessions (island UI delete) ------------------------------

def hidden_path():
    return os.path.join(live_dir(), 'hidden-sessions.json')

def hidden_sessions():
    """Session ids hidden from the island history. Never throws."""
    try:
        with open(hidden_path(), encoding='utf-8') as f:
            data = json.load(f)
        return set(data) if isinstance(data, list) else set()
    except (OSError, ValueError):
        return set()

def hide_session(sid):
    """Hide one agent session everywhere the island lists it (survives
    restarts; opencode/claude's own stores are never touched)."""
    sid = str(sid or '').strip()
    if not sid:
        return []
    hidden = hidden_sessions()
    hidden.add(sid)
    try:
        with open(hidden_path(), 'w', encoding='utf-8') as f:
            json.dump(sorted(hidden), f)
    except OSError:
        pass
    return sorted(hidden)

def _opencode_db():
    """Read-only handle to opencode's sqlite. None when locked/missing."""
    db = os.path.join(os.path.expanduser('~'), '.local', 'share',
                      'opencode', 'opencode.db')
    try:
        return sqlite3.connect('file:%s?mode=ro' % db.replace('%', '%25'),
                               uri=True, timeout=2)
    except Exception:
        return None


def opencode_usage(now=None):
    """Token/cost snapshot for the Daily grid, off opencode's own db.

    today = sessions updated local-today; current = latest updated.
    Cost is provider-reported (0 on free tiers). Never throws."""
    empty = {'provider': 'opencode', 'model': '', 'today': {
        'in': 0, 'out': 0, 'cached': 0, 'cost': 0.0, 'sessions': 0},
        'current': {'title': '', 'model': '', 'in': 0, 'out': 0,
                    'cost': 0.0}}
    try:
        now = now or time.time()
        day = time.strftime('%Y-%m-%d', time.localtime(now))
        c = _opencode_db()
        if c is None:
            return empty
        try:
            rows = c.execute(
                'SELECT id, title, model, cost, tokens_input,'
                ' tokens_output, tokens_cache_read, time_updated'
                ' FROM session ORDER BY time_updated DESC LIMIT 60'
            ).fetchall()
        finally:
            try:
                c.close()
            except Exception:
                pass
        today = dict(empty['today'])
        current = dict(empty['current'])
        model, latest = '', None
        for sid, title, mjs, cost, ti, to, cr, upd in rows:
            ts = (upd or 0) / 1000.0
            if ts and time.strftime('%Y-%m-%d',
                                    time.localtime(ts)) == day:
                today['in'] += ti or 0
                today['out'] += to or 0
                today['cached'] += cr or 0
                today['cost'] += cost or 0.0
                today['sessions'] += 1
            if latest is None and ts:
                try:
                    m = json.loads(mjs or '{}')
                    model = m.get('id') or ''
                except ValueError:
                    model = ''
                current = {'title': str(title or '')[:80], 'model': model,
                           'in': ti or 0, 'out': to or 0,
                           'cost': cost or 0.0}
                latest = sid
            if not model and mjs:
                try:
                    model = (json.loads(mjs) or {}).get('id') or ''
                except ValueError:
                    pass
        return {'provider': 'opencode', 'model': model, 'today': today,
                'current': current}
    except Exception:
        return empty


def opencode_db_sessions(limit=12):
    """Terminal sessions straight from opencode's own sqlite (read-only).
    The hooks log only sees sessions that emitted events; the db sees every
    chat ever started in opencode, so the island can pick them up. Never
    throws — a locked/missing db just yields []."""
    db = os.path.join(os.path.expanduser('~'), '.local', 'share',
                      'opencode', 'opencode.db')
    try:
        c = sqlite3.connect('file:%s?mode=ro' % db.replace('%', '%25'),
                            uri=True, timeout=2)
    except Exception:
        return []
    try:
        rows = c.execute(
            'SELECT id, title, time_updated FROM session '
            'ORDER BY time_updated DESC LIMIT ?', (limit,)).fetchall()
        out = []
        for sid, title, updated in rows:
            first = title or '?'
            try:
                parts = c.execute(
                    'SELECT data FROM part WHERE session_id=? '
                    'ORDER BY time_created LIMIT 8', (sid,)).fetchall()
                for (data,) in parts:
                    try:
                        p = json.loads(data)
                    except ValueError:
                        continue
                    if p.get('type') == 'text' and (p.get('text') or '').strip():
                        first = p['text'].strip()
                        break
            except Exception:
                pass
            out.append({'session': sid,
                        'ts': (updated or 0) / 1000.0,
                        'agent': 'opencode',
                        'first': str(first)[:60]})
        return out
    except Exception:
        return []
    finally:
        try:
            c.close()
        except Exception:
            pass

def claude_projects_sessions(limit=12):
    """Claude Code chats from ~/.claude/projects (one .jsonl per session).
    Same pickup idea as opencode_db_sessions; empty today (no runs yet on
    this machine), automatic the moment claude chats exist. Never throws."""
    import glob
    base = os.path.join(os.path.expanduser('~'), '.claude', 'projects')
    try:
        files = glob.glob(os.path.join(base, '*', '*.jsonl'))
    except Exception:
        return []
    try:
        files = sorted(files, key=lambda p: os.path.getmtime(p),
                       reverse=True)[:limit]
    except OSError:
        return []
    out = []
    for p in files:
        try:
            first = None
            with open(p, encoding='utf-8') as f:
                for ln in f:
                    ln = ln.strip()
                    if not ln:
                        continue
                    try:
                        e = json.loads(ln)
                    except ValueError:
                        continue
                    if e.get('type') != 'user':
                        continue
                    msg = e.get('message') or {}
                    bits = []
                    for b in (msg.get('content') or []):
                        if isinstance(b, dict) and b.get('type') == 'text':
                            bits.append(b.get('text') or '')
                        elif isinstance(b, str):
                            bits.append(b)
                    text = ''.join(bits).strip()
                    if text:
                        first = text
                        break
                    # tool_result-only user turns aren't chat openers; keep scanning
            out.append({'session': os.path.splitext(os.path.basename(p))[0],
                        'ts': os.path.getmtime(p),
                        'agent': 'claude',
                        'first': str(first or '?')[:60]})
        except (OSError, ValueError):
            continue
    return out

# --- chat persistence (sent messages, editable) ---------------------------

class ChatLog:
    """ndjson chat {i, role, text, ts, provider, edited} — island restarts
    reload it; edits mark the line so you can see what you changed."""

    def __init__(self, path=None):
        self.path = path or chat_path()
        self.items = []
        self.load()

    def load(self):
        self.items = []
        try:
            with open(self.path, encoding='utf-8') as f:
                for ln in f:
                    ln = ln.strip()
                    if not ln:
                        continue
                    try:
                        e = json.loads(ln)
                    except ValueError:
                        continue
                    if isinstance(e, dict) and e.get('text'):
                        self.items.append(e)
        except OSError:
            pass
        self.items = self.items[-60:]

    def _flush(self):
        d = os.path.dirname(self.path)
        try:
            if not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
            with open(self.path, 'w', encoding='utf-8') as f:
                for e in self.items:
                    f.write(json.dumps(e, ensure_ascii=False) + '\n')
        except OSError:
            pass

    def add(self, role, text, provider=''):
        if not text:
            return None
        e = {'i': len(self.items), 'role': role,
             'text': str(text)[:4000], 'ts': time.time(), 'provider': provider}
        self.items.append(e)
        self._flush()
        return e

    def set(self, i, new_text):
        """Edit message i in place (marks edited)."""
        if not (0 <= i < len(self.items)):
            return False
        self.items[i]['text'] = str(new_text)[:4000]
        self.items[i]['edited'] = True
        self._flush()
        return True

    def truncate_from(self, i):
        """Drop everything from i onward (chat edit = regroup downstream)."""
        if not (0 <= i < len(self.items)):
            return False
        self.items = self.items[:i]
        self._flush()
        return True

# --- provider commands ------------------------------------------------------

# install dirs the official scripts use — the bridge often inherits a thin
# PATH from the desktop launcher, so a working CLI reads as missing.
# Checked live per call: a fresh install shows up with no restart.
_HOME_BINS = (
    os.path.join(os.path.expanduser('~'), '.opencode', 'bin'),
    os.path.join(os.path.expanduser('~'), '.local', 'bin'),
)


def _which(name):
    for d in os.environ.get('PATH', '').split(os.pathsep):
        if d and os.access(os.path.join(d, name), os.X_OK):
            return True
    for d in _HOME_BINS:
        if os.access(os.path.join(d, name), os.X_OK):
            return True
    return False


def claude_available():
    return _which('claude')


def opencode_available():
    return _which('opencode')


def provider_available(provider):
    if provider == 'claude':
        return claude_available()
    if provider == 'opencode':
        return opencode_available()
    return provider == 'router'


def describe_command(provider, msg, session_id=None, yolo=False):
    """argv list for running an agent turn. msg/argv safe (no shell)."""
    if provider == 'claude':
        if session_id:  # multi-turn: resume + stream-json in/out
            argv = ['claude', '-p', '--resume', session_id,
                    '--input-format', 'stream-json',
                    '--output-format', 'stream-json', '--verbose']
            if yolo:
                argv.append('--dangerously-skip-permissions')
            return argv, json.dumps({'type': 'user',
                                     'message': {'role': 'user',
                                                 'content': msg}}) + '\n'
        argv = ['claude', '-p', msg, '--output-format', 'stream-json',
                '--verbose', '--include-partial-messages']
        if yolo:
            argv.append('--dangerously-skip-permissions')
        return argv, None
    if provider == 'opencode':
        argv = ['opencode', 'run', '--format', 'json']
        if session_id:
            argv.append('--session')
            argv.append(session_id)
        argv.append(msg)
        return argv, None
    raise ValueError(provider)


def claude_line(evs):
    """Given one JSON line (dict) from claude stream-json, return an update
    dict or None: {session} | {text_delta} | {assistant_text} | {tool,file}
    | {result, ok, session}."""
    if not isinstance(evs, dict):
        return None
    t = evs.get('type')
    if t == 'system' and evs.get('subtype') == 'init':
        return {'session': evs.get('session_id')}
    if t == 'assistant':
        msg = evs.get('message') or {}
        out = {}
        texts, tools = [], []
        for b in (msg.get('content') or []):
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'text':
                texts.append(b.get('text') or '')
            elif b.get('type') == 'tool_use':
                inp = b.get('input') or ({} if not isinstance(b.get('input'), dict) else b.get('input'))
                tools.append((b.get('name') or 'tool',
                              (inp.get('file_path') or inp.get('notebook_path') or '')))
        if texts:
            out['assistant_text'] = '\n'.join(x for x in texts if x)
        if tools:
            name, f = tools[0]
            out.update(tool=name, file=f)
        return out or None
    if t == 'result':
        return {'result': evs.get('result') or '',
                'ok': evs.get('subtype') == 'success',
                'session': evs.get('session_id')}
    return None


def opencode_line(j):
    """One `opencode run --format json` line -> update dict or None:
    {session} | {activity} | {text} | {result} | {tool, file}.
    Handles both dash and underscore step names, and text living either
    top-level or under part.text (opencode >= 1.x nests it)."""
    if not isinstance(j, dict):
        return None
    out = {}
    sid = j.get('sessionID') or j.get('session_id')
    if not sid and isinstance(j.get('session'), dict):
        sid = j['session'].get('id')
    if sid:
        out['session'] = sid
    t = j.get('type')
    part = j.get('part') if isinstance(j.get('part'), dict) else {}
    text = j.get('text') if isinstance(j.get('text'), str) else ''
    if not text and isinstance(part.get('text'), str):
        text = part['text']
    if t in ('step-start', 'step_start'):
        out['activity'] = 'thinking…'
    elif t == 'tool' or part.get('type') == 'tool':
        name = (j.get('tool') or j.get('name') or part.get('tool') or 'tool')
        args = (j.get('arguments') or (j.get('state') or {}).get('input')
                or part.get('input') or {})
        fp = ''
        if isinstance(args, dict):
            fp = (args.get('file_path') or args.get('filePath')
                  or args.get('path') or '')
        out.update(tool=name, file=os.path.basename(fp) if fp else '',
                   activity=('· %s %s' % (name,
                             os.path.basename(fp) if fp else '')).strip())
    elif t == 'text' and text:
        out['text'] = text
    elif t in ('step-finish', 'step_finish', 'finish') and text:
        out['result'] = text
    return out or None


def summarize_stream_updates(updates, user_text):
    """Collapse a browser of stream updates into (activity, partial_agent_text,
    session_id, final_text)."""
    activity = ''
    partial = ''
    session = ''
    final = ''
    for u in updates:
        session = u.get('session') or session
        if 'tool' in u:
            f = os.path.basename(u.get('file') or '')
            activity = ('· %s %s' % (u['tool'], f)).strip()
        if 'assistant_text' in u and u['assistant_text']:
            partial = u['assistant_text']
            activity = 'mid-thought'
        if 'result' in u:
            final = u['result']
            partial = final
            activity = 'finished ✓' if u.get('ok', True) else 'failed ✗'
    return activity, (partial if not final else final), session, final


# --- ping-island lifecycle + titles + usage (ported rules) ---------------

IDLE_HIDE_AFTER = 30 * 60  # primary list hides quiet sessions after 30 min


def needs_attention(e):
    """Sessions needing manual action stay visible + pop the island."""
    if not isinstance(e, dict):
        return False
    if e.get('attention'):
        return True
    if e.get('event') == 'Notification':
        return True
    t = (e.get('text') or '').lower()
    return any(k in t for k in ('approval', 'permission', 'needs input',
                                '?', 'please confirm'))


def visible_sessions(sess_list, now=None):
    """Ended stays until archived; quiet >30min hides unless attention."""
    now = now or time.time()
    out = []
    for s in sess_list:
        if not isinstance(s, dict):
            continue
        age = now - (s.get('ts') or 0)
        if s.get('attention') or s.get('needs_attention'):
            out.append(s)
        elif age < IDLE_HIDE_AFTER:
            out.append(s)
    return out


def session_title(evs, sid):
    """First user prompt, else newest tool/file, else '?'. Survives reboots."""
    for e in evs:
        if e.get('session') == sid and e.get('event') == 'UserPromptSubmit' \
                and e.get('text'):
            t = e['text'].strip().splitlines()[0][:60]
            return t
    for e in reversed(evs):
        if e.get('session') == sid and (e.get('tool') or e.get('text')):
            return str(e.get('tool') or e.get('text'))[:60]
    return '?'


def transcript_usage(path):
    """Token totals from a Claude transcript .jsonl.

    One assistant message spans several lines (one per content block)
    repeating message.usage — count each message.id once per consecutive
    run (O(1), no ever-growing seen-set). Half-written trailing line
    is skipped. Never throws."""
    totals = {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheCreation': 0}
    last_id, last_run = None, False
    try:
        with open(path, encoding='utf-8') as f:
            lines = f.read().splitlines()[-4000:]
    except OSError:
        return totals
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        try:
            e = json.loads(ln)
        except ValueError:
            continue  # half-written tail: skip
        msg = e.get('message') or {}
        u = msg.get('usage') or e.get('usage')
        if not isinstance(u, dict):
            continue
        mid = msg.get('id') or e.get('message_id') or ''
        if mid and mid == last_id and last_run:
            continue  # same message, next content block
        last_id, last_run = mid, bool(mid)
        try:
            totals['input'] += int(u.get('input_tokens') or 0)
            totals['output'] += int(u.get('output_tokens') or 0)
            totals['cacheRead'] += int(u.get('cache_read_input_tokens') or 0)
            totals['cacheCreation'] += int(
                u.get('cache_creation_input_tokens') or 0)
        except (TypeError, ValueError):
            continue
    return totals
