"""Demo-mode fixtures — port of agent-isle's tickDemo (MIT).

Deterministic scripted session cycle for screenshots, UI dev, and tests:
working -> waiting(approval) -> working -> asking -> done. No timers here;
the caller advances the tick. Stdlib only.
"""
import time

SCRIPT = [
    ('working', 'Edit app.py +12 -3'),
    ('waiting', 'Bash npm run test'),
    ('working', 'Write tests +40 -0'),
    ('asking', 'Which strategy: blue/green?'),
    ('done', 'finished ✓'),
]

DEMO_SESSIONS = [
    {'session': 'demo-claude-1', 'agent': 'claude', 'first': 'refactor login flow'},
    {'session': 'demo-codex-1', 'agent': 'codex', 'first': 'add rate limit'},
    {'session': 'demo-opencode-1', 'agent': 'opencode', 'first': 'fix flaky test'},
]


def demo_sessions():
    now = time.time()
    return [dict(s, ts=now, pending=False, unread=False) for s in DEMO_SESSIONS]


def tick(state):
    """Advance one demo step. state: {'i': int}. Returns event-like dict."""
    i = int(state.get('i', 0))
    status, activity = SCRIPT[i % len(SCRIPT)]
    sess = DEMO_SESSIONS[i % len(DEMO_SESSIONS)]
    state['i'] = i + 1
    return {'session': sess['session'], 'agent': sess['agent'],
            'event': 'PreToolUse' if status in ('working', 'waiting') else
                     ('UserPromptSubmit' if status == 'asking' else 'Stop'),
            'tool': activity.split()[0] if status in ('working', 'waiting') else '',
            'text': activity, 'ts': time.time(),
            'attention': status in ('waiting', 'asking'),
            'status': status, 'activity': activity}
