#!/usr/bin/env python3
"""Steroids Island — always-on-top top-edge companion (stdlib tkinter only).

Ours: a borderless black bar docked top-center. Spotter mascot with headband
+ right-side knot tails (asymmetric on purpose). Plate snap motion, no
bounce: poke squish 140ms, strain 800ms, flex pulse 600ms, breathe 3s,
jump on new route.

Views (spotter voice, short):
  overview  recent routes + index status                <- served.jsonl
  empty     no reps yet                                 <- no hints
  ask       type a prompt, get a route                   <- router.route_query
  question  close call: pick one                         <- score within 70%
  result    trigs -> top-3 + Teach                       <- --correct
  finished  route logged (auto-OK 5s)
  error     exception card + Retry
  confused  too many taps at once (auto-back 2s)
Deferred (no Steroids data yet): upload/choose/mail, settings, chat providers.

States: hidden (withdrawn, hover top-center to peek) | flex (thin bar) |
jacked (expanded views) | pump (launch greeting).

Usage:
  python3 island/app.py           # run detached: nohup ... &
  python3 island/app.py --check   # smoke test: all views + live query, exit
  python3 island/app.py --install-hooks  # wire claude code + opencode hooks
"""
import importlib.util
import json
import math
import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog
from agentlog import ChatLog

# --- FSM timings (mirror island/fsm.js) ---
FLEX_TO_HIDDEN = 60.0
JACKED_TO_FLEX = 15.0
GREET_AUTO = 3.0

C = {'skin': '#e8823c', 'light': '#f7cf9f', 'top': '#f2c184',
     'dark': '#b95f26', 'white': '#fff6ea', 'pupil': '#14100b', 'band': '#ff4d1c'}
ACCENT = '#ff4d1c'
CARD = '#17181c'
DIM = '#9aa0a6'
BODY = [
    (4, 3, 6, 1, C['top']), (2, 4, 10, 1, C['band']), (12, 4, 2, 1, C['band']),
    (1, 5, 12, 1, C['skin']),
    (0, 5, 1, 3, C['dark']), (13, 5, 1, 3, C['dark']),
    (1, 6, 1, 2, C['skin']), (5, 6, 4, 2, C['skin']), (12, 6, 1, 2, C['skin']),
    (1, 8, 1, 1, C['skin']), (2, 8, 3, 1, C['white']),
    (5, 8, 4, 1, C['skin']), (9, 8, 3, 1, C['white']), (12, 8, 1, 1, C['skin']),
    (2, 9, 10, 1, C['skin'])]
EYES = [
    {'cx': 3.5, 'whites': [(2, 6, 3, 1), (2, 7, 1, 1), (4, 7, 1, 1)], 'pupil': (3, 7)},
    {'cx': 10.5, 'whites': [(9, 6, 3, 1), (9, 7, 1, 1), (11, 7, 1, 1)], 'pupil': (10, 7)}]

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER_PY = os.path.join(REPO_ROOT, 'src', 'steroids', 'router.py')


def install_hooks():
    """Wire Claude Code hooks + OpenCode relay copy. Idempotent, merge-only."""
    relay = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         'hook_relay.py'))
    cmd = '%s %s claude' % (sys.executable, relay)
    marker = 'hook_relay.py'
    claude_dir = os.path.expanduser('~/.claude')
    settings = os.path.join(claude_dir, 'settings.json')
    try:
        os.makedirs(claude_dir, exist_ok=True)
        data = {}
        if os.path.isfile(settings):
            try:
                with open(settings, encoding='utf-8') as f:
                    data = json.load(f) or {}
            except Exception:
                data = {}
            if not isinstance(data, dict):
                data = {}
        hooks = data.setdefault('hooks', {})
        added = []
        for ev in ('SessionStart', 'UserPromptSubmit', 'PreToolUse',
                   'PostToolUse', 'Stop', 'SessionEnd'):
            lst = hooks.setdefault(ev, [])
            if not any(marker in (h.get('command', '') if isinstance(h, dict) else str(h))
                       for h in lst):
                lst.append({'type': 'command', 'command': cmd})
                added.append(ev)
        with open(settings, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        dst = os.path.expanduser('~/.config/opencode/plugins/steroids')
        os.makedirs(dst, exist_ok=True)
        for fn in ('hook_relay.py', 'agentlog.py'):
            shutil.copy(os.path.join(os.path.dirname(relay), fn),
                        os.path.join(dst, fn))
        ev_src = os.path.join(REPO_ROOT, 'plugins', 'opencode', 'steroids-events.ts')
        if os.path.isfile(ev_src):
            shutil.copy(ev_src, os.path.expanduser(
                '~/.config/opencode/plugins/steroids-events.ts'))
        print('claude hooks: %s -> %s' % (', '.join(added) or 'already installed', settings))
        print('opencode relay: copied to %s' % dst)
        print('opencode plugin: installed steroids-events.ts')
        return 0
    except Exception as e:
        print('install-hooks failed: %s' % e, file=sys.stderr)
        return 1


def live_dirs():
    home = os.path.expanduser('~')
    return [os.path.join(home, '.config', 'steroids'),
            os.path.join(home, '.config', 'opencode', 'plugins', 'steroids')]


def tail_hints(n=12):
    """Newest-first 'trigs -> skill' strings from served.jsonl. Never throws."""
    for d in live_dirs():
        p = os.path.join(d, 'served.jsonl')
        if os.path.isfile(p):
            path = p
            break
    else:
        return [], 0
    try:
        with open(path, 'rb') as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 65536))
            lines = f.read().decode('utf-8', 'replace').splitlines()
    except OSError:
        return [], 0
    out = []
    for ln in reversed(lines):
        ln = ln.strip()
        if not ln:
            continue
        try:
            e = json.loads(ln)
        except ValueError:
            continue
        skills = e.get('skills') or []
        trigs = e.get('trigs') or []
        if isinstance(skills, str):  # live log stores plain strings, not lists
            skills = [skills]
        if isinstance(trigs, str):
            trigs = [t for t in trigs.split(',') if t]
        if not skills:
            continue
        name = skills[0].split('/')[-1][:40]
        out.append(('%s -> %s' % (','.join(trigs[:3]) or '?', name)).strip())
        if len(out) >= n:
            break
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = 0
    return out, mtime


_router_mod = None
_version_cache = None


def router():
    """Lazy import of src/steroids/router.py (same process, no subprocess)."""
    global _router_mod
    if _router_mod is None:
        spec = importlib.util.spec_from_file_location('steroids_router_live', ROUTER_PY)
        _router_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(_router_mod)
    return _router_mod


def _version():
    """Version from pyproject.toml (via router.get_version). Cached, never throws."""
    global _version_cache
    if _version_cache is None:
        try:
            _version_cache = router().get_version()
        except Exception:
            _version_cache = 'dev'
    return _version_cache


class Island:
    def __init__(self):
        import tkinter as tk
        self.tk = tk
        self.root = tk.Tk()
        self.root.overrideredirect(True)
        self.root.attributes('-topmost', True)
        self.root.configure(bg='black')
        self.sw = self.root.winfo_screenwidth()
        # DPI: 4K screens dwarf a 248px bar — scale chrome like the demo's presence
        self.K = 1.5 if self.sw >= 3500 else 1.0
        try:
            self.root.tk.call('tk', 'scaling',
                              self.root.tk.call('tk', 'scaling') * self.K)
        except Exception:
            pass
        self.W_FLEX, self.H_FLEX = int(248 * self.K), int(52 * self.K)
        self.W_JACK, self.H_JACK = 640, int(290 * self.K)
        self.state = 'hidden'
        self.view = 'overview'
        self.pinned = False  # idle bar hides; hover top-center to peek
        self._in_zone = False
        self._geom_job = None
        self.enter_at = 0.0  # mascot pop-in anchor
        self.timers = {}
        self.look = [0.0, 0.0]
        now = time.monotonic()
        self.next_blink = now + 2.0
        self.blink_until = 0.0
        self.squish_until = 0.0
        self.annoyed_until = 0.0
        self.dizzy_until = 0.0
        self.dizzy_from = 0.0
        self.jump_until = 0.0
        self.jump_from = 0.0
        self.taps = []
        self.hints = []
        self.hint_i = 0
        self.last_mtime = 0
        self.last_prompt = ''
        self.last_top = []
        self.clicks = 0
        self.debug_path = '/tmp/opencode/island-debug.json'
        self._src_mtime = os.path.getmtime(os.path.abspath(__file__))
        self._dwell_start = None  # hover-dwell opener (clickless fallback)
        self._dwell_armed = True  # re-arm only after leaving the zone
        self._away_start = None
        self._btn_dwell = None  # (widget_path, since) for rest-to-press
        self._mascot_dwell = None
        self.S = int(4 * self.K)  # screen px per mascot pixel
        self.big = None  # (canvas, S) large mascot in overview card, or None
        # --- agent sessions (Claude Code / OpenCode live state) ---
        self.events = []          # newest-first ledger events
        self.sessions = []        # distinct session ids, newest first
        self.agent = {'state': 'idle', 'activity': '', 'when': 0.0}
        self._streams = {}        # chat stream state (tok, dict)
        self._qq = queue.Queue()  # thread -> Tk chat updates
        self.chat = ChatLog()     # persistent chat history (survives restarts)
        self._provider = 'router'
        self._claude_session = None
        self._oc_session = None

        self.canvas = tk.Canvas(self.root, width=14 * self.S, height=14 * self.S,
                                bg='black', highlightthickness=0, cursor='hand2')
        self.canvas.grid(row=0, column=0, padx=(10, 6), pady=4)
        # ranked minis: top-4 recent skills, ours orange first, rest dim
        self.minis = tk.Frame(self.root, bg='black')
        self.minis.grid(row=0, column=1, padx=(0, 10))
        # jacked area: header tabs + view container
        self.body = tk.Frame(self.root, bg='black')
        self.tabs = tk.Frame(self.body, bg='black')
        self.btn_overview = self._tab('Overview', lambda: self.show('overview'))
        self.btn_ask = self._tab('Chat', lambda: self.show('ask'))
        self.btn_sessions = self._tab('Sessions', lambda: self.show('sessions'))
        self.btn_overview.pack(side='left', padx=(0, 4))
        self.btn_ask.pack(side='left')
        self.btn_sessions.pack(side='left')
        self.pill = tk.Label(self.tabs, text='steroids v%s' % _version(), fg=DIM, bg='black',
                             font=('monospace', 8))
        self.pill.pack(side='left', padx=(10, 0))
        self.tk.Label(self.tabs, text='rest: button = press · mascot = shrink',
                      fg=DIM, bg='black', font=('monospace', 7)).pack(side='right')
        self.tabs.pack(fill='x', padx=10, pady=(0, 4))
        self.stage = tk.Frame(self.body, bg=CARD)
        self.stage.pack(fill='both', expand=True, padx=10, pady=(0, 8))

        # NOTE: <Button-1> == <ButtonPress-1> in Tk: ONE bind, it does both.
        # (Two binds here silently replace each other — that killed clicks.)
        self.root.bind('<ButtonPress-1>', self._press)  # drag-anchor + bar click
        self.root.bind('<Enter>', lambda e: self._entered())
        self.root.bind('<Leave>', lambda e: self._left())
        self.root.bind('<Escape>', lambda e: self.force_flex())
        self.root.bind('<Button-3>', self._menu)
        self.root.bind('<B1-Motion>', self._drag_move)
        self._drag_xy = None

        self._x = (self.sw - self.W_FLEX) // 2  # seed real pos before springs
        self._place(self.W_FLEX, self.H_FLEX)
        self._go('pump')
        self._place(self.W_FLEX, self.H_FLEX)
        if os.environ.get('ISLAND_OPEN'):  # screenshot/debug: start expanded
            self.refresh_hints(silent=True)
            self._go('jacked')
            self.no_auto_collapse = True
            v = os.environ.get('ISLAND_VIEW')
            if v:
                self.show(v)
        else:
            self.no_auto_collapse = False
        self._later('greet', GREET_AUTO, lambda: self._go('flex') if self.state == 'pump' else None)
        self.refresh_hints(silent=True)
        self._poll()
        self._frame()

    # --- widgets ---
    def _tab(self, label, fn):
        return self.tk.Button(self.tabs, text=label, command=fn, fg='white', bg='#26272c',
                              activebackground=ACCENT, relief='flat', font=('monospace', 8),
                              padx=10, pady=2)

    def _btn(self, parent, label, fn, primary=False):
        return self.tk.Button(parent, text=label, command=fn,
                              fg='white' if primary else DIM,
                              bg=ACCENT if primary else '#26272c',
                              activebackground=ACCENT, relief='flat',
                              font=('monospace', 8), padx=10, pady=3)

    def _card_label(self, parent, text, size=9, color='white', wrap=620):
        return self.tk.Label(parent, text=text, fg=color, bg=CARD,
                             font=('monospace', size), wraplength=wrap, justify='left')

    # --- FSM ---
    # --- container motion: plate snap 180ms, no overshoot. A bar doesn't bounce.
    @staticmethod
    def _snap(t):
        return 1 - (1 - t) ** 3

    _back_out = _snap  # compat: old spring name now snaps
    _ease_inout = _snap

    def _spring_to(self, w1, h1, ms=180, ease=None, done=None):
        if self._geom_job is not None:
            try:
                self.root.after_cancel(self._geom_job)
            except Exception:
                pass
            self._geom_job = None
        try:
            cur = self.root.geometry().split('+')[0]
            w0, h0 = [int(v) for v in cur.split('x')]
            x0 = int(self.root.geometry().split('+')[1])
        except Exception:
            w0, h0, x0 = w1, h1, (self.sw - w1) // 2
        anchor = x0 + w0 // 2  # grow/shrink around center, like the island
        if w0 < 10:  # window never mapped: anchor screen center, not junk
            anchor = self.sw // 2
        ease = ease or self._back_out
        t0 = time.monotonic()

        def step():
            p = min(1.0, (time.monotonic() - t0) / (ms / 1000.0))
            e = ease(p)
            w = max(1, int(w0 + (w1 - w0) * e))
            h = max(1, int(h0 + (h1 - h0) * e))
            x = min(max(0, anchor - w // 2), max(0, self.sw - w))
            try:
                self.root.geometry('%dx%d+%d+0' % (w, h, x))
            except Exception:
                pass
            if p < 1.0:
                self._geom_job = self.root.after(16, step)
            else:
                self._geom_job = None
                if done:
                    done()
        step()

    def _go(self, nxt):
        if nxt == self.state:
            return
        if self._geom_job is not None:
            try:
                self.root.after_cancel(self._geom_job)
            except Exception:
                pass
            self._geom_job = None
        self.state = nxt
        if nxt == 'hidden':
            # shrink back to bar, then vanish (never just blink out)
            self._spring_to(self.W_FLEX, self.H_FLEX, ms=180, ease=self._ease_inout,
                            done=lambda: self.root.withdraw() if self.state == 'hidden' else None)
        else:
            self.root.deiconify()
            self.root.attributes('-topmost', True)
            self.enter_at = time.monotonic()  # mascot pops in
            if nxt == 'jacked':
                self._spring_to(self.W_JACK,
                                int(360 * self.K) if self.view in ('ask', 'sessions') else self.H_JACK)
                self.body.grid(row=1, column=0, columnspan=2, sticky='ew')
                self.show(self.view if self.view not in ('ask',) else 'overview')
            else:
                self.body.grid_forget()
                self._spring_to(self.W_FLEX, self.H_FLEX, ms=340, ease=self._ease_inout)

    def _place(self, w, h):
        x = (self.sw - w) // 2 if getattr(self, '_x', None) is None else self._x
        self.root.geometry('%dx%d+%d+0' % (w, h, x))

    def _later(self, key, secs, fn):
        self._cancel(key)
        self.timers[key] = self.root.after(int(secs * 1000), fn)

    def _cancel(self, key):
        if key in self.timers:
            try:
                self.root.after_cancel(self.timers[key])
            except Exception:
                pass
            del self.timers[key]

    def _entered(self):
        if self.state == 'flex':
            self._cancel('hide')

    def _left(self):
        if self.pinned:
            return
        if self.state == 'flex':
            self._later('hide', FLEX_TO_HIDDEN, lambda: self._go('hidden'))
        elif self.state == 'jacked':
            self._later('collapse', JACKED_TO_FLEX, lambda: self._go('flex'))

    def force_flex(self):
        for k in list(self.timers):
            self._cancel(k)
        self._go('flex')

    # --- input ---
    def _press(self, ev):
        self._drag_start(ev)
        self._bar_click(ev)

    def _bar_click(self, ev):
        self.clicks += 1
        # clicks on real controls (tabs, buttons, entry) belong to them
        if isinstance(ev.widget, (self.tk.Button, self.tk.Entry, self.tk.Text)):
            return
        self._mascot_click(ev)

    def _mascot_click(self, ev):
        now = time.monotonic()
        self.taps = [t for t in self.taps if now - t < 0.6]
        self.taps.append(now)
        if self.state == 'flex':
            self._go('jacked')
        if self.hints:
            self.hint_i = (self.hint_i + 1) % len(self.hints)
            self.pill.configure(text=self.hints[self.hint_i])
        if len(self.taps) >= 4:
            self.taps = []
            self.dizzy_from = now
            self.dizzy_until = now + 0.6  # flex pulse, not a spin
            if self.state == 'jacked':
                self.show('confused')
                self._later('unconfuse', 2.0, lambda: self.show('overview'))
        elif len(self.taps) == 2:
            self.squish_until = now + 0.14
            self.annoyed_until = now + 0.8
        else:
            self.squish_until = now + 0.14

    def _menu(self, ev):
        m = self.tk.Menu(self.root, tearoff=0)
        m.add_command(label='Hide', command=lambda: self._go('hidden'))
        m.add_command(label='Unpin (auto-hide)' if self.pinned else 'Pin (always show)',
                      command=self._toggle_pin)
        m.add_command(label='Quit island', command=self.root.destroy)
        m.tk_popup(ev.x_root, ev.y_root)

    def _toggle_pin(self):
        self.pinned = not self.pinned

    def _drag_start(self, ev):
        self._drag_xy = (ev.x_root, ev.y_root)
        if self._geom_job is not None:  # user takes over mid-spring
            try:
                self.root.after_cancel(self._geom_job)
            except Exception:
                pass
            self._geom_job = None

    def _drag_move(self, ev):
        if not self._drag_xy:
            return
        dx = ev.x_root - self._drag_xy[0]
        self._x = max(0, (getattr(self, '_x', (self.sw - self.W_FLEX) // 2)) + dx)
        self._drag_xy = (ev.x_root, ev.y_root)
        g = self.root.geometry().split('+')[0]
        self.root.geometry('%s+%d+0' % (g, self._x))

    # --- live data ---
    def _sync_minis(self):
        """Compact ear-grid: top-4 recent skills as colored minis (their compact)."""
        for w in self.minis.winfo_children():
            w.destroy()
        cells = []
        seen = set()
        for h in self.hints:
            skill = h.split('->')[-1].strip().split('/')[-1]
            if skill and skill not in seen:
                seen.add(skill)
                cells.append((skill, h))
            if len(cells) == 4:
                break
        while len(cells) < 4:
            cells.append(('?', None))
        for i, (skill, hint) in enumerate(cells):
            if hint is None:
                b = self.tk.Label(self.minis, text='·', fg='#454850', bg='black',
                                  font=('monospace', 10, 'bold'), width=3)
            else:
                b = self.tk.Button(self.minis, text=skill[0].upper(),
                                   fg='white', bg=self.PILL_COLORS[i % len(self.PILL_COLORS)],
                                   activebackground=self.PILL_COLORS[i % len(self.PILL_COLORS)],
                                   relief='flat', font=('monospace', 9, 'bold'),
                                   width=3, padx=4, pady=2,
                                   command=lambda h=hint: (
                                       self._go('jacked'),
                                       self.pill.configure(text=h),
                                       self.show('finished', top=[(1.0, h.split('->')[-1].strip(), [])],
                                                 prompt=h, note='open ✓')))
            b.grid(row=i // 2, column=i % 2, padx=2, pady=2)

    def refresh_hints(self, silent=False):
        self._poll_agent()
        hints, mtime = tail_hints()
        if hints and mtime and mtime != self.last_mtime:
            self.last_mtime = mtime
            new_top = hints[0] != (self.hints[0] if self.hints else None)
            self.hints = hints
            self.pill.configure(text=hints[self.hint_i % len(hints)])
            self._sync_minis()
            if self.view == 'overview' and self.state == 'jacked':
                self.show('overview')
            if new_top and not silent:
                now = time.monotonic()  # happy jump on fresh route
                self.jump_from = now
                self.jump_until = now + 0.5
        elif not self.hints:
            self.pill.configure(text='steroids %s · no routes yet' % _version())
            self._sync_minis()

    def do_ask(self, prompt):
        """Run router in-process. Returns (top, error). top = [(score, skill, hits)]."""
        try:
            r = router()
            rules = r.load_rules()
            idx = r.get_index(rules)
            top = r.route_query(prompt, rules, idx)
            return top, ''
        except Exception as e:
            return [], '%s: %s' % (type(e).__name__, e)

    def teach(self, prompt, skill):
        try:
            subprocess.run([sys.executable, ROUTER_PY, '--correct', prompt,
                            '--skill', skill], capture_output=True, timeout=60)
            return True
        except Exception:
            return False

    # --- agent sessions (live Claude Code / OpenCode state) ---
    def _poll_agent(self):
        evs = agentlog.read_events(limit=300)
        self.events = list(reversed(evs))  # newest first
        self.sessions = agentlog.sessions(evs)
        state, activity = agentlog.latest(evs)
        prev = self.agent.get('state')
        if state != prev:
            self.agent = {'state': state, 'activity': activity, 'when': time.time()}
            if state == 'working':
                self.pill.configure(text='working %s' % activity[:42])
            elif state == 'thinking':
                self.pill.configure(text='agent thinking…')
            elif state == 'finished' and prev == 'working':
                self.pill.configure(text='done ✓')
                now = time.monotonic()  # happy jump: agent finished a task
                self.jump_from = now
                self.jump_until = now + 0.5
        else:
            self.agent['activity'] = activity

    def _say_user(self, hist, e):
        """Render one persisted user bubble; click it to edit + resend."""
        i = e['i']
        tag = 'm%d' % i
        hist.tag_config(tag)
        hist.insert('end', e['text'] + ('  ✎' if e.get('edited') else '') + '\n',
                    ('user', tag))
        hist.tag_bind(tag, '<Enter>', lambda ev: hist.configure(cursor='hand2'))
        hist.tag_bind(tag, '<Leave>', lambda ev: hist.configure(cursor=''))
        hist.tag_bind(tag, '<Button-1>',
                      lambda ev, i=i, t=e['text']: self._edit_chat(i, t))

    def _edit_chat(self, i, old_text):
        """Edit a sent message: popup editor; save = branch chat + resend."""
        if getattr(self, '_busy', False):
            return
        tk = self.tk
        win = tk.Toplevel(self.root)
        win.title('edit message')
        win.configure(bg='#0b0c0e')
        win.geometry('+%d+%d' % (max(0, (self.sw - 420) // 2), 80))
        win.attributes('-topmost', True)
        tk.Label(win, text='✎ edit message — save & resend branches the chat',
                 fg=ACCENT, bg='#0b0c0e', font=('monospace', 8)).pack(anchor='w',
                                                                     padx=8, pady=(8, 2))
        txt = tk.Text(win, width=54, height=6, bg='#1c1e22', fg='white',
                      relief='flat', insertbackground='white',
                      font=('monospace', 9), wrap='word')
        txt.pack(fill='both', expand=True, padx=8, pady=4)
        txt.insert('1.0', old_text)
        row = tk.Frame(win, bg='#0b0c0e')
        row.pack(anchor='e', padx=8, pady=(0, 8))

        def save():
            new = txt.get('1.0', 'end').strip()
            win.destroy()
            if not new or new == old_text:
                return
            self.chat.truncate_from(i)   # branch: drop from here down
            e = self.chat.add('user', new)
            self.chat.set(e['i'], new)   # marks it edited (✎)
            self.show('ask')
            self._send_chat(new)

        self._btn(row, 'Save & resend', save, primary=True).pack(side='left', padx=(0, 6))
        self._btn(row, 'Cancel', win.destroy).pack(side='left')
        txt.focus_set()

    def _set_provider(self, name):
        self._provider = name
        if self.view == 'ask':
            self.show('ask')

    def _send_chat(self, msg):
        """Dispatch one chat turn to the selected provider."""
        provider = getattr(self, '_provider', 'router')
        if provider == 'router':
            self._router_reply(msg)
            return
        self._busy = True
        st = {'provider': provider, 'msg': msg, 'partial': '', 'activity': '',
              'session': None, 'q': self._qq}
        self._streams[id(st)] = st
        threading.Thread(target=self._run_agent, args=(st, self._qq), daemon=True).start()
        self.pill.configure(text='%s: working…' % provider)

    def _router_reply(self, msg):
        """Local skill-router answer, async like the old ask flow."""
        self._busy = True
        self.pill.configure(text='routing…')

        def run():
            top, err = self.do_ask(msg)
            self._busy = False
            if err:
                self.chat.add('bot', 'route failed: %s' % err[:120], 'router')
            elif not top:
                self.chat.add('bot', 'no confident skill — abstaining', 'router')
            else:
                trigs = ','.join(list(top[0][2])[:3]) or '?'
                try:
                    router().log_impression(msg, list(top[0][2])[:3], [t[1] for t in top])
                except Exception:
                    pass
                self.chat.add('bot', '%s  →  %s' % (trigs, top[0][1].split('/')[-1]),
                              'router')
                self.last_top = top
            self.refresh_hints(silent=True)
            if self.view == 'ask':
                self.show('ask')

        self.root.after(350, run)

    def _run_agent(self, st, q):
        """Child-process runner (own thread). Puts partial updates into q;
        the final update carries done=True."""
        provider, msg = st['provider'], st['msg']
        try:
            session_id = st.get('session') or getattr(
                self, '_claude_session' if provider == 'claude' else '_oc_session', None)
            argv, stdin_payload = agentlog.describe_command(provider, msg, session_id)
            if not shutil.which(argv[0]):
                q.put({'done': True, 'ok': False, 'error': '%s not on PATH' % argv[0]})
                return
            p = subprocess.Popen(
                argv,
                stdin=subprocess.PIPE if stdin_payload else subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                env=dict(os.environ, CLAUDE_CODE_ENTRYPOINT='steroids-island'))
            if stdin_payload:
                def feed():
                    try:
                        p.stdin.write(stdin_payload.encode('utf-8'))
                        p.stdin.close()
                    except Exception:
                        pass
                threading.Thread(target=feed, daemon=True).start()
            session, partial, activity, result_text, ok = '', '', '', '', True
            plain = []
            if provider == 'claude':
                for ln in p.stdout:
                    ln = ln.strip()
                    if not ln:
                        continue
                    try:
                        j = json.loads(ln)
                    except ValueError:
                        continue
                    u = agentlog.claude_line(j)
                    if not u:
                        continue
                    session = u.get('session') or session
                    if 'tool' in u:
                        activity = ('· %s %s' % (u['tool'],
                                   os.path.basename(u.get('file') or ''))).strip()
                    if u.get('assistant_text'):
                        partial = u['assistant_text']
                    if 'result' in u:
                        result_text = u.get('result') or partial
                        ok = bool(u.get('ok', True))
                    q.put({'partial': partial, 'activity': activity, 'session': session})
            else:  # opencode run --format json
                for ln in p.stdout:
                    ln = ln.strip()
                    if not ln:
                        continue
                    plain.append(ln)
                    try:
                        j = json.loads(ln)
                    except ValueError:
                        continue
                    u = agentlog.opencode_line(j)
                    if not u:
                        continue
                    session = u.get('session') or session
                    if u.get('activity'):
                        activity = u['activity']
                    if u.get('text'):
                        partial = u['text']
                    if u.get('result'):
                        result_text = u['result']
                    q.put({'partial': partial, 'activity': activity, 'session': session})
            rc = p.wait()
            if not result_text and partial:
                result_text = partial
            if not result_text and plain:
                result_text = '\n'.join(plain)[-4000:]
            q.put({'done': True, 'ok': rc == 0 and ok,
                   'result': result_text or '…', 'session': session or None,
                   'error': None if rc == 0 else 'exit %s' % rc})
        except Exception as e:
            q.put({'done': True, 'ok': False,
                   'error': '%s: %s' % (type(e).__name__, e)})

    def _drain_streams(self):
        """Queue -> stream state (main thread). Re-renders chat on change."""
        if not self._streams:
            return
        moved = False
        for st in list(self._streams.values()):
            try:
                while True:
                    upd = st['q'].get_nowait()
                    moved = True
                    for k in ('partial', 'activity', 'session'):
                        if upd.get(k):
                            st[k] = upd[k]
                    if upd.get('done'):
                        st['done'] = True
                        st['ok'] = upd.get('ok', False)
                        st['error'] = upd.get('error')
                        if upd.get('result'):
                            st['result'] = upd['result']
            except queue.Empty:
                pass
        if moved:
            finished = [st for st in list(self._streams.values()) if st.get('done')]
            for st in finished:
                self._streams.pop(id(st), None)
                self._finish_chat_turn(st)
            self._busy = bool(self._streams)
            if self.view == 'ask':
                self.show('ask')

    def _finish_chat_turn(self, st):
        prov = st.get('provider')
        if st.get('ok'):
            self.chat.add('bot', (st.get('result') or st.get('partial') or '…')[:4000], prov)
        else:
            self.chat.add('bot', '⚠ %s' % (st.get('error') or 'failed'), prov)
        sid = st.get('session')
        if sid and prov == 'claude':
            self._claude_session = sid
        elif sid and prov == 'opencode':
            self._oc_session = sid
        self.refresh_hints(silent=True)

    def _open_session(self, sid):
        evs = [e for e in self.events if e.get('session') == sid]
        self._go('jacked')
        self.show('ask', session_events=evs, session_id=sid)

    # --- views ---
    def show(self, name, **kw):
        self.view = name
        self.big = None
        for w in self.stage.winfo_children():
            w.destroy()
        if self.state == 'jacked':  # tall views get tall panels
            tall = name in ('ask', 'sessions', 'question', 'result')
            self._spring_to(640, int(360 * self.K) if tall else self.H_JACK,
                            ms=180, ease=self._ease_inout)
        self.btn_overview.configure(bg=ACCENT if name in ('overview', 'empty', 'finished') else '#26272c')
        self.btn_ask.configure(bg=ACCENT if name in ('ask', 'question', 'result') else '#26272c')
        self.btn_sessions.configure(bg=ACCENT if name == 'sessions' else '#26272c')
        {'overview': self.v_overview, 'empty': self.v_empty, 'ask': lambda: self.v_ask(**kw),
         'sessions': self.v_sessions,
         'question': lambda: self.v_question(**kw), 'result': lambda: self.v_result(**kw),
         'finished': lambda: self.v_finished(**kw), 'error': lambda: self.v_error(**kw),
         'confused': self.v_confused}[name]()
        self.stage.update_idletasks()

    PILL_COLORS = ['#ff4d1c', '#3d3e45', '#3d3e45', '#3d3e45']  # ours first, rest dim

    def _pill_btn(self, parent, label, color, fn):
        b = self.tk.Button(parent, text=label, command=fn, fg='white', bg=color,
                           activebackground=color, relief='flat', font=('monospace', 8, 'bold'),
                           padx=8, pady=6, wraplength=130, justify='center')
        return b

    def v_overview(self):
        if not self.hints:
            self.v_empty()
            return
        f = self.stage
        cols = self.tk.Frame(f, bg=CARD)
        cols.pack(fill='both', expand=True, padx=10, pady=8)
        self.big = None
        # left: character card (big mascot + route pipeline checklist)
        left = self.tk.Frame(cols, bg='#0b0c0e', highlightbackground='#26272c',
                             highlightthickness=1)
        left.pack(side='left', fill='both', expand=True, padx=(0, 6))
        big = self.tk.Canvas(left, width=14 * 8, height=14 * 8, bg='#0b0c0e',
                             highlightthickness=0)
        big.pack(anchor='w', padx=8, pady=(8, 0))
        self.big = (big, 8)
        self._card_label(left, 'steroids router', size=8, color=DIM).pack(anchor='w', padx=8)
        for step in ('Parse', 'Score', 'Rank', 'Log'):
            self._card_label(left, '✓ ' + step, size=8, color='#34d399').pack(anchor='w', padx=8)
        lrow = self.tk.Frame(left, bg='#0b0c0e')
        lrow.pack(anchor='w', padx=8, pady=(2, 8))
        self._btn(lrow, 'Ask', lambda: self.show('ask'), primary=True).pack(side='left', padx=(0, 6))
        self._btn(lrow, 'OK', lambda: self._go('flex')).pack(side='left')
        # right: live route card + skill pills
        right = self.tk.Frame(cols, bg=CARD)
        right.pack(side='left', fill='both', expand=True)
        detail = self.tk.Frame(right, bg='#0b0c0e', highlightbackground='#26272c',
                               highlightthickness=1)
        detail.pack(fill='x', pady=(0, 6))
        cur = self.hints[0]
        trigs = cur.split('->')[0].strip() if '->' in cur else '?'
        top1 = cur.split('->')[-1].strip() if '->' in cur else cur
        self._card_label(detail, '● live route', size=8, color=ACCENT).pack(anchor='w', padx=8, pady=(6, 0))
        self._card_label(detail, top1[:52], size=10).pack(anchor='w', padx=8)
        self._card_label(detail, ('trigs: ' + trigs)[:52], size=8, color=DIM).pack(anchor='w', padx=8, pady=(0, 6))
        grid = self.tk.Frame(right, bg=CARD)
        grid.pack(fill='x')
        seen, pills = set(), []
        for h in self.hints:
            skill = h.split('->')[-1].strip().split('/')[-1][:18]
            if skill and skill not in seen:
                seen.add(skill)
                pills.append((skill, h))
            if len(pills) == 4:
                break
        for i, (skill, hint) in enumerate(pills):
            b = self._pill_btn(grid, skill, self.PILL_COLORS[i % len(self.PILL_COLORS)],
                               lambda h=hint: (self.pill.configure(text=h),
                                               self.show('finished', top=[(1.0, h.split('->')[-1].strip(), [])],
                                                         prompt=h, note='open ✓')))
            # ranked: ours first (orange), rest dim — no stagger, show at once
            b.grid(row=i // 2, column=i % 2, padx=3, pady=3, sticky='nsew')
        for c in (0, 1):
            grid.grid_columnconfigure(c, weight=1)

    def v_empty(self):
        f = self.stage
        self._card_label(f, 'No reps yet.', size=10).pack(anchor='w', padx=10, pady=(10, 2))
        self._card_label(f, 'Ask and the spotter points at the skill.',
                         color=DIM).pack(anchor='w', padx=10)
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=8)
        self._btn(row, 'Ask steroids', lambda: self.show('ask'), primary=True).pack(side='left')

    def v_ask(self, session_events=None, session_id=None):
        """Chat: provider picker (router / claude / opencode), streaming
        bubbles, live edit ticker; click a sent bubble to edit + resend.
        With session_events: shows one agent session's transcript instead."""
        f = self.stage
        card = self.tk.Frame(f, bg='#0b0c0e', highlightbackground='#26272c',
                             highlightthickness=1)
        card.pack(fill='both', expand=True, padx=10, pady=8)
        prov = self.tk.Frame(card, bg='#0b0c0e')
        prov.pack(anchor='w', padx=8, pady=(6, 0))
        self.tk.Label(prov, text='provider:', fg=DIM, bg='#0b0c0e',
                      font=('monospace', 8)).pack(side='left', padx=(0, 4))
        for name, label, dot in (('router', 'router', '#34d399'),
                                 ('claude', 'claude', '#d97757'),
                                 ('opencode', 'opencode', '#a78bfa')):
            avail = name == 'router' or agentlog.provider_available(name)
            b = self.tk.Button(
                prov, text=('● ' if avail else '○ ') + label,
                fg='white' if self._provider == name else DIM,
                bg=ACCENT if self._provider == name else '#1c1e22',
                activebackground=ACCENT, relief='flat', font=('monospace', 8),
                state='normal' if avail else 'disabled',
                command=lambda n=name: self._set_provider(n))
            b.pack(side='left', padx=2)
        if session_id:
            self.tk.Label(prov, text='· transcript %s…' % str(session_id)[:12],
                          fg=DIM, bg='#0b0c0e', font=('monospace', 8)).pack(side='left', padx=6)
        hist = self.tk.Text(card, height=6, bg='#0b0c0e', fg='white', relief='flat',
                            highlightthickness=0, borderwidth=0, font=('monospace', 9),
                            wrap='word', state='disabled')
        hist.pack(fill='both', expand=True, padx=8, pady=4)
        hist.tag_config('user', foreground='white', justify='right',
                        background='#1c1e22', lmargin1=120, rmargin=4)
        hist.tag_config('bot', foreground='white', justify='left', lmargin1=4, rmargin=60)
        hist.tag_config('dim', foreground=DIM, justify='left')
        hist.tag_config('tool', foreground='#fb923c', justify='left', lmargin1=4)
        hist.tag_config('stream', foreground='#a78bfa', justify='left', lmargin1=4, rmargin=60)

        def say(role, text, tag=None):
            hist.configure(state='normal')
            hist.insert('end', text + '\n', (tag or role,))
            hist.configure(state='disabled')
            hist.see('end')

        if session_events is not None:  # transcript of one agent session
            for it in agentlog.transcript(session_events):
                if it['role'] == 'user':
                    say('user', it['text'])
                elif it.get('kind') == 'tool':
                    say('tool', '· ' + it['text'], 'tool')
                else:
                    say('bot', it['text'])
            hist.see('end')
            return
        # persisted chat: user bubbles are clickable -> edit + resend
        for e in self.chat.items:
            if e['role'] == 'user':
                self._say_user(hist, e)
            else:
                say('bot', e['text'], 'dim' if e.get('provider') == 'router' else None)
        st = next(iter(self._streams.values()), None)
        if st:
            if st.get('activity'):
                say('tool', st['activity'], 'tool')
            if st.get('partial'):
                say('bot', st['partial'], 'stream')
            else:
                say('bot', '···', 'typing')
        elif not self.chat.items:
            for h in self.hints[:4]:
                say('bot', '· ' + h, 'dim')

        bar = self.tk.Frame(card, bg='#0b0c0e')
        bar.pack(fill='x', padx=8, pady=(0, 8))
        ent = self.tk.Entry(bar, bg='#1c1e22', fg='white', insertbackground='white',
                            relief='flat', font=('monospace', 9))
        ent.pack(side='left', fill='x', expand=True, padx=(0, 6), ipady=5)
        ent.insert(0, getattr(self, '_draft', ''))  # keep typing across re-renders
        ent.bind('<KeyRelease>', lambda e: setattr(self, '_draft', ent.get()))

        def submit(ev=None):
            msg = ent.get().strip()
            if not msg or getattr(self, '_busy', False):
                return
            ent.delete(0, 'end')
            self._draft = ''
            self.chat.add('user', msg, self._provider)
            self._send_chat(msg)

        send = self.tk.Button(bar, text='↑', command=submit, fg='black', bg='white',
                              activebackground=ACCENT, relief='flat',
                              font=('monospace', 10, 'bold'), padx=10)
        send.pack(side='left')
        ent.bind('<Return>', submit)
        ent.focus_set()

    def v_sessions(self):
        """Agent sessions: live state card + history (claude / opencode)."""
        f = self.stage
        st = self.agent.get('state', 'idle')
        act = self.agent.get('activity', '')
        dot = {'idle': DIM, 'thinking': '#fb923c', 'working': ACCENT,
               'finished': '#34d399', 'error': '#FF8D97'}.get(st, DIM)
        head = self.tk.Frame(f, bg='#0b0c0e', highlightbackground='#26272c',
                             highlightthickness=1)
        head.pack(fill='x', padx=10, pady=(8, 6))
        self.tk.Label(head, text='● agent %s' % st, fg=dot, bg='#0b0c0e',
                      font=('monospace', 10, 'bold')).pack(anchor='w', padx=8, pady=(6, 0))
        self._card_label(head, act or 'no agent activity yet — run: python3 '
                                     'island/app.py --install-hooks',
                         color=DIM, size=8).pack(anchor='w', padx=8, pady=(0, 6))
        body = self.tk.Frame(f, bg=CARD)
        body.pack(fill='both', expand=True, padx=10, pady=(0, 6))
        self._card_label(body, 'recent sessions', size=8, color=DIM).pack(
            anchor='w', padx=4, pady=(0, 2))
        if not self.sessions:
            self._card_label(body, 'no sessions yet — run claude or opencode with '
                                   'steroids hooks installed', color=DIM,
                             size=9).pack(anchor='w', padx=4, pady=4)
        for s in self.sessions[:8]:
            row = self.tk.Frame(body, bg='#0b0c0e', highlightbackground='#26272c',
                                highlightthickness=1)
            row.pack(fill='x', pady=2)
            when = ''
            ts = s.get('ts')
            if ts:
                dt = max(0, time.time() - ts)
                when = ('%dm ago' % int(dt / 60)) if dt >= 60 else ('%ds ago' % int(dt))
            self._card_label(row, '%s · %s · %s' % (s.get('agent', '?'), when,
                                                    s.get('first', '?')),
                             size=8).pack(anchor='w', padx=6, pady=(4, 0))
            self._btn(row, 'open',
                      lambda sid=s['session']: self._open_session(sid)).pack(
                anchor='w', padx=6, pady=(0, 4))
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=(0, 8))
        self._btn(row, 'OK', lambda: self.show('overview'), primary=True).pack(side='left')

    def v_question(self, top, prompt):
        f = self.stage
        self._card_label(f, 'Close call — spot one.', color=ACCENT).pack(anchor='w', padx=10, pady=(8, 2))
        self._card_label(f, prompt, color=DIM, size=8).pack(anchor='w', padx=10)
        for score, skill, hits in top:
            b = self._btn(f, '%s  (%.2f)' % (skill, score),
                          lambda s=skill: self._pick(prompt, s))
            b.pack(anchor='w', padx=10, pady=2)
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=8)
        self._btn(row, 'Back', lambda: self.show('ask')).pack(side='left')

    def _pick(self, prompt, skill):
        ok = self.teach(prompt, skill)
        self.refresh_hints()
        self.show('finished', top=[(1.0, skill, [])], prompt=prompt,
                  note='logged ✓' if ok else 'shown (teach failed)')

    def v_result(self, top, prompt):
        f = self.stage
        if not top:
            self._card_label(f, 'no confident skill — abstaining', color=ACCENT).pack(anchor='w', padx=10, pady=(10, 2))
        else:
            self._card_label(f, '%s -> %s' % (','.join(top[0][2][:3]) or '?', top[0][1]),
                             size=10).pack(anchor='w', padx=10, pady=(10, 2))
            for score, skill, hits in top[1:]:
                self._btn(f, 'Teach: %s (%.2f)' % (skill, score),
                          lambda s=skill: self._pick(prompt, s)).pack(anchor='w', padx=10, pady=2)
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=8)
        self._btn(row, 'OK', lambda: self.show('overview'), primary=True).pack(side='left')

    def v_finished(self, top, prompt, note='routed ✓'):
        f = self.stage
        self._card_label(f, '%s  %s' % (note, top[0][1] if top else ''), color=ACCENT,
                         size=10).pack(anchor='w', padx=10, pady=(10, 2))
        self._card_label(f, prompt, color=DIM, size=8).pack(anchor='w', padx=10)
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=8)
        self._btn(row, 'OK', lambda: self.show('overview'), primary=True).pack(side='left')
        self._later('autook', 5.0, lambda: self.show('overview') if self.view == 'finished' else None)

    def v_error(self, msg):
        f = self.stage
        self._card_label(f, 'Route failed', color='#FF8D97', size=10).pack(anchor='w', padx=10, pady=(10, 2))
        self._card_label(f, msg[:300], color=DIM, size=8).pack(anchor='w', padx=10)
        row = self.tk.Frame(f, bg=CARD)
        row.pack(anchor='e', padx=10, pady=8)
        self._btn(row, 'Retry', lambda: (self.show('ask')), primary=True).pack(side='left', padx=(0, 6))
        self._btn(row, 'OK', lambda: self.show('overview')).pack(side='left')

    def v_confused(self):
        f = self.stage
        self._card_label(f, 'Easy. One rep at a time.', size=10).pack(anchor='w', padx=10, pady=(14, 2))
        self._card_label(f, 'Tap once, spotter sees it.', color=DIM).pack(anchor='w', padx=10, pady=(0, 10))

    # --- loops ---
    def _poll(self):
        self._drain_streams()
        try:  # live design loop: save app.py and the island restarts itself
            if not os.environ.get('ISLAND_NORELOAD') and \
                    os.path.getmtime(os.path.abspath(__file__)) != self._src_mtime:
                os.execv(sys.executable, [sys.executable, os.path.abspath(__file__)] +
                         (['--check'] if '--check' in sys.argv else []))
        except Exception:
            pass
        try:
            x, y = self.root.winfo_pointerx(), self.root.winfo_pointery()
            cx = getattr(self, '_x', (self.sw - self.W_FLEX) // 2) + self.W_FLEX // 2
            in_zone = y <= 30 and abs(x - cx) < 160  # panel-height tripwire
            if self.state == 'hidden' and in_zone and not self._in_zone:
                self._go('flex')  # hover top-center to peek (edge-triggered)
            self._in_zone = in_zone
            if self.state != 'hidden':
                self.look = [max(-1.0, min(1.0, (x - cx) / 400.0)),
                             max(-1.0, min(1.0, (y - 30) / 400.0))]
            nowm = time.monotonic()
            # clickless fallback: rest cursor on the bar 0.6s -> expand
            if self.state == 'flex':
                if y <= 60 and abs(x - cx) < 150:
                    if self._dwell_armed:
                        if self._dwell_start is None:
                            self._dwell_start = nowm
                        elif nowm - self._dwell_start > 0.6:
                            self._dwell_start = None
                            self._dwell_armed = False
                            self._go('jacked')
                else:
                    self._dwell_start = None
                    self._dwell_armed = True
            # idle 60s with nobody near -> hide completely (nothing standing)
            if self.state == 'flex' and not self.pinned:
                if y <= 80 and abs(x - cx) < 200:
                    self._idle_start = nowm
                elif nowm - getattr(self, '_idle_start', nowm) > 60.0:
                    self._idle_start = nowm
                    self._go('hidden')
            # clickless fallback: rest on a button 0.9s -> press it
            if self.state == 'jacked':
                try:
                    w = self.root.winfo_containing(x, y)
                except Exception:
                    w = None
                if isinstance(w, self.tk.Button):
                    key = str(w)
                    if self._btn_dwell is None or self._btn_dwell[0] != key:
                        self._btn_dwell = (key, nowm)
                    elif nowm - self._btn_dwell[1] > 0.9:
                        self._btn_dwell = None
                        try:
                            w.invoke()
                        except Exception:
                            pass
                else:
                    self._btn_dwell = None
                # drifted away 2s -> collapse (pinned only guards hidden)
                if not getattr(self, 'no_auto_collapse', False) and (y > 250 or abs(x - cx) > 250):
                    if self._away_start is None:
                        self._away_start = nowm
                    elif nowm - self._away_start > 2.0:
                        self._away_start = None
                        self._go('flex')
                else:
                    self._away_start = None
                # rest on mascot 1.2s while open -> shrink (no clicks needed)
                try:
                    over_mascot = isinstance(self.canvas.winfo_containing(x, y), self.tk.Canvas)
                except Exception:
                    over_mascot = False
                if over_mascot:
                    if self._mascot_dwell is None:
                        self._mascot_dwell = nowm
                    elif nowm - self._mascot_dwell > 1.2:
                        self._mascot_dwell = None
                        self._go('flex')
                else:
                    self._mascot_dwell = None
        except Exception:
            pass
        self.refresh_hints()
        try:
            with open(self.debug_path, 'w') as f:
                json.dump({
                    't': time.time(), 'state': self.state, 'view': self.view,
                    'clicks': self.clicks, 'geom': self.root.geometry(),
                    'mapped': bool(self.root.winfo_ismapped()),
                    'viewable': bool(self.root.winfo_viewable()),
                    'pointer': [self.root.winfo_pointerx(), self.root.winfo_pointery()],
                }, f)
        except Exception:
            pass
        self.root.after(500, self._poll)

    def _polys(self, now):
        """Yield (color, [(x,y)...]) polygons for one frame."""
        if now >= self.next_blink:
            self.blink_until = now + 0.12
            self.next_blink = now + 4.6
        blinking = now < self.blink_until
        sy = 0.85 if now < self.squish_until else 1.0 + 0.03 * (0.5 - 0.5 * math.cos(
            now / 3.0 * math.pi * 2))
        sx = 1.15 if now < self.squish_until else 1.0
        dt = now - getattr(self, 'enter_at', 0.0)
        if 0 <= dt < 0.18:  # snap in on reveal, no overshoot
            pop = max(0.01, Island._snap(dt / 0.18))
            sx *= pop
            sy *= pop
        flexing = now < self.dizzy_until
        flex = 1 + 0.12 * math.sin(((now - self.dizzy_from) / 0.6) * math.pi) if flexing else 1.0
        sx *= flex
        sy *= 2 - flex
        dy = 0.0
        if now < self.jump_until:
            jp = (now - self.jump_from) / 0.5
            dy = -4.2 * (jp / 0.35) if jp < 0.35 else (-4.2 + 4.2 * ((jp - 0.35) / 0.35) if jp < 0.7 else 0.0)
        ca, sa = 1.0, 0.0

        def xf(px, py):
            qx, qy = 7 + (px - 7) * sx, 10 + (py - 10) * sy + dy  # pivot bottom-center
            rx, ry = qx - 7, qy - 7
            return (7 + rx * ca - ry * sa, 7 + rx * sa + ry * ca)

        def cell(x, y, w, h):
            return [xf(x, y), xf(x + w, y), xf(x + w, y + h), xf(x, y + h)]

        for (x, y, w, h, col) in BODY:
            yield col, cell(x, y, w, h)
        annoyed = now < self.annoyed_until
        for eye in EYES:
            if annoyed:
                yield C['pupil'], cell(eye['cx'] - 1.5, 6.8, 3, 0.35)
                continue
            esy = 0.08 if (blinking or flexing) else 1.0

            def ecell(x, y, w, h):
                return [
                    xf(x, 7 + (y - 7) * esy), xf(x + w, 7 + (y - 7) * esy),
                    xf(x + w, 7 + (y + h - 7) * esy), xf(x, 7 + (y + h - 7) * esy)]
            for (x, y, w, h) in eye['whites']:
                yield C['white'], ecell(x, y, w, h)
            if not blinking and not spinning:
                px, py = eye['pupil']
                yield C['pupil'], ecell(px + self.look[0] * 0.8, py + self.look[1] * 0.8, 1, 1)

    def _frame(self):
        if self.state != 'hidden':
            try:
                now = time.monotonic()
                targets = [(self.canvas, self.S)]
                if self.big is not None:
                    try:
                        if self.big[0].winfo_exists():
                            targets.append(self.big)
                    except Exception:
                        self.big = None
                polys = list(self._polys(now))
                for cv, S in targets:
                    cv.delete('all')
                    for col, pts in polys:
                        cv.create_polygon(
                            [c for p in pts for c in (p[0] * S, p[1] * S)],
                            fill=col, outline='')
            except Exception:
                pass
        self.root.after(16, self._frame)

    def run(self):
        self.root.mainloop()


BRIDGE_PORT = 8096


def bridge_live(port=BRIDGE_PORT):
    try:
        s = socket.create_connection(('127.0.0.1', port), timeout=0.5)
        s.close()
        return True
    except OSError:
        return False


def ensure_bridge():
    """Hot pipe before first use, not at drop time.

    The bridge (chat API + phone relay hub) spawns once with the island;
    drops are then bare WS frames (ms). Spawning it on drop would be the
    slow path. Never throws and never double-spawns: if the port answers,
    this is a no-op — island works without it (mock chat, queued drops).
    LAN-bound (0.0.0.0) so the paired phone browser can reach it; the hub
    only routes frames whose key matches a verified pairing.
    """
    if bridge_live():
        return
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        os.makedirs(os.path.expanduser('~/.config/steroids'), exist_ok=True)
        out = open(os.path.expanduser('~/.config/steroids/bridge.log'), 'ab')
    except OSError:
        out = subprocess.DEVNULL  # type: ignore[assignment]
    try:
        subprocess.Popen(
            [sys.executable, '-u', os.path.join(here, 'bridge.py'),
             '--serve', '--host', '0.0.0.0', str(BRIDGE_PORT)],
            stdout=out, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL, start_new_session=True)
    except (OSError, ValueError):
        pass


def main(argv):
    if '--install-hooks' in argv:
        return install_hooks()
    check = '--check' in argv
    try:
        app = Island()
    except Exception as e:
        print('island: no display? (%s)' % e)
        return 1
    if check:
        assert abs(Island._snap(0.0)) < 1e-9 and abs(Island._snap(1.0) - 1) < 1e-9
        assert Island._snap(0.5) == 0.875  # cubic snap, no overshoot
        assert Island._back_out is Island._snap
        app._go('flex')
        app.root.update()  # let the window map or synthetic events drop
        app.root.event_generate('<Button-1>', x=20, y=20)
        app.root.update()
        assert app.clicks >= 1, 'click binding dead'
        assert app.state == 'jacked', app.state
        for name in ('overview', 'empty', 'ask', 'sessions', 'error'):
            app.show(name, **({'msg': 'smoke'} if name == 'error' else {}))
            app.root.update()
        top, err = app.do_ask('write a git commit message')
        assert not err, err
        assert top, 'no route returned'
        print('ask -> %s (%.2f)' % (top[0][1], top[0][0]))
        app.show('result', top=top, prompt='write a git commit message')
        app.root.update()
        app.show('finished', top=top, prompt='write a git commit message')
        app.root.update()
        if len(top) >= 2:
            app.show('question', top=top, prompt='write a git commit message')
            app.root.update()
        app.show('confused')
        app.root.update()
        for _ in range(60):
            app.root.update()
            time.sleep(1.0 / 60.0)
        print('island check OK: state=%s views=all rendered hints=%d' % (app.state, len(app.hints)))
        app.root.destroy()
        return 0
    ensure_bridge()
    app.run()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
