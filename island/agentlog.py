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
        'Notification': 'Notification', 'Stop': 'Stop',
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
    return {
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


def normalize(p, agent='claude'):
    if not isinstance(p, dict):
        return None
    if p.get('kind') or agent == 'opencode':
        return normalize_opencode(p, 'opencode')
    return normalize_claude(p, agent if agent != 'opencode' else 'claude')

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

def claude_available():
    for d in os.environ.get('PATH', '').split(os.pathsep):
        if d and os.access(os.path.join(d, 'claude'), os.X_OK):
            return True
    return False


def opencode_available():
    for d in os.environ.get('PATH', '').split(os.pathsep):
        if d and os.access(os.path.join(d, 'opencode'), os.X_OK):
            return True
    return False


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
