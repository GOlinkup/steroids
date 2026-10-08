"""Jump back to the agent's terminal — port of SessionLauncher.

Linux equiv of ping-island's iTerm2/Ghostty/Terminal/tmux/IDE focus:
tmux pane first (exact), then window raise via wmctrl/xdotool when
present, else best-effort terminal spawn hint. Never throws.
"""
import os
import shutil
import subprocess


def _compositor():
    """hyprland | sway | kde | x11 — env detection (standard practice)."""
    e = os.environ
    if e.get('HYPRLAND_INSTANCE_SIGNATURE'):
        return 'hyprland'
    if e.get('SWAYSOCK'):
        return 'sway'
    if e.get('KDE_FULL_SESSION') or e.get('KDE_SESSION_VERSION'):
        return 'kde'
    return 'x11'


def _run(*argv):
    try:
        subprocess.run(list(argv), timeout=3, capture_output=True)
        return True
    except (OSError, subprocess.TimeoutExpired):
        return False


def _focus_pid(pid):
    comp = _compositor()
    if comp == 'hyprland' and shutil.which('hyprctl'):
        return _run('hyprctl', 'dispatch', 'focuswindow', 'pid:%s' % pid)
    if comp == 'sway' and shutil.which('swaymsg'):
        return _run('swaymsg', '[pid=%s] focus' % pid)
    if comp == 'kde' and shutil.which('wmctrl'):
        try:
            p = subprocess.run(['wmctrl', '-l', '-p'], capture_output=True,
                               text=True, timeout=3)
            for ln in (p.stdout or '').splitlines():
                parts = ln.split()
                if len(parts) > 2 and parts[2] == str(pid):
                    return _run('wmctrl', '-i', '-a', parts[0])
        except (OSError, subprocess.TimeoutExpired):
            return False
    if shutil.which('xdotool'):
        return _run('xdotool', 'search', '--pid', str(pid), '--limit', '1',
                    'windowactivate', '--sync')
    return False


def focus(ev):
    """ev: ledger event with tmux/tty/cwd context. Returns {ok, how}.

    Priority: tmux pane (exact) -> term_pid via compositor dispatch
    (hyprland/sway/kde/x11) -> title fallback -> cwd hint. Never throws."""
    if not isinstance(ev, dict):
        return {'ok': False, 'error': 'no event'}
    pane = ev.get('tmux') or ''
    if pane and pane.startswith('%') and shutil.which('tmux'):
        try:
            subprocess.run(['tmux', 'select-pane', '-t', pane],
                           timeout=3, capture_output=True)
            subprocess.run(['tmux', 'select-window', '-t', pane],
                           timeout=3, capture_output=True)
            return {'ok': True, 'how': 'tmux'}
        except (OSError, subprocess.TimeoutExpired):
            pass
    if ev.get('term_pid') and _focus_pid(ev['term_pid']):
        return {'ok': True, 'how': _compositor()}
    title = ev.get('title_hint') or ''
    if title:
        if _compositor() == 'sway' and shutil.which('swaymsg'):
            if _run('swaymsg', '[title="%s"] focus' % title):
                return {'ok': True, 'how': 'sway-title'}
        if shutil.which('xdotool'):
            if _run('xdotool', 'search', '--name', title, 'windowactivate'):
                return {'ok': True, 'how': 'xdotool-title'}
    tty = ev.get('tty') or ''
    if tty and shutil.which('wmctrl'):
        try:
            subprocess.run(['wmctrl', '-a', 'Terminal'],
                           timeout=3, capture_output=True)
            return {'ok': True, 'how': 'wmctrl'}
        except (OSError, subprocess.TimeoutExpired):
            pass
    if shutil.which('xdotool'):
        try:
            subprocess.run(['xdotool', 'search', '--onlyvisible',
                            '--class', 'terminal', 'windowactivate'],
                           timeout=3, capture_output=True)
            return {'ok': True, 'how': 'xdotool'}
        except (OSError, subprocess.TimeoutExpired):
            pass
    cwd = ev.get('cwd')
    if cwd and os.path.isdir(cwd):
        return {'ok': True, 'how': 'cwd', 'cwd': cwd}
    return {'ok': False, 'error': 'no focus path (install tmux/wmctrl)'}
