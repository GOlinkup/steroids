# Standalone: Steroids without VS Code

One command, no editor, no terminal babysitting:

```sh
/home/TWIG/steroids/scripts/standalone.sh          # bridge + browser URL
/home/TWIG/steroids/scripts/standalone.sh --electron  # bridge + pill shell
/home/TWIG/steroids/scripts/standalone.sh --check    # static self-check
/home/TWIG/steroids/scripts/standalone.sh --install  # app-menu entry
```

Behavior: attaches to a live bridge on `:8096` if one answers `/health`;
starts one detached (log `~/.local/state/steroids/bridge.log`) if the port
is free; refuses if the port is held by a stranger. Never kills anything.
One process serves API + built UI (`island-ui/dist` via `bridge.py --serve`).
Fresh checkout needs `npm --prefix island-ui run build` first (`--check` says so).
