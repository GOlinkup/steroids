"""Terminal context capture — port of ping-island's PingIslandBridge.

Every hook envelope carries where the agent runs so the island can
jump back to it: cwd, tty, tmux pane, window id, desktop app.
Stdlib only, never throws, ~1ms (env reads, no subprocess).
"""
import os


def capture():
    """Context dict merged into every ledger event."""
    out = {}
    try:
        out['cwd'] = os.getcwd()[:256]
    except OSError:
        pass
    for k, dest in (('TMUX_PANE', 'tmux'), ('TMUX', 'tmux_server'),
                    ('TERM_PROGRAM', 'term_program'),
                    ('GHOSTTY_RESOURCES_DIR', 'ghostty'),
                    ('ITERM_SESSION_ID', 'iterm'),
                    ('VSCODE_PID', 'vscode'),
                    ('CURSOR_TRACE_ID', 'cursor'),
                    ('SSH_CONNECTION', 'ssh')):
        v = os.environ.get(k)
        if v:
            out[dest] = str(v)[:128]
    try:
        out['tty'] = os.ttyname(0)[:64]
    except OSError:
        pass
    ppid = os.environ.get('STEROIDS_TERM_PID')
    if ppid:
        out['term_pid'] = str(ppid)[:16]
    else:
        pid = tty_owner_pid(out.get('tty', ''))
        if pid:
            out['term_pid'] = str(pid)
    return out


def tty_owner_pid(tty):
    """PID whose stdin is this tty (vibe-island idea, clean-room /proc scan).
    Returns int or 0. Bounded readdir, never throws."""
    if not tty:
        return 0
    name = tty.replace('/dev/', '', 1)
    try:
        pids = [p for p in os.listdir('/proc') if p.isdigit()]
    except OSError:
        return 0
    for pid in pids[:2000]:
        try:
            if os.readlink('/proc/%s/fd/0' % pid).endswith(name):
                return int(pid)
        except (OSError, ValueError):
            continue
    return 0
