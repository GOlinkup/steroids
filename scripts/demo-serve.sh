#!/usr/bin/env bash
# Demo server launcher: serves demo/ and auto-closes with the CLI.
# The server PID is trapped on EXIT/INT/HUP/TERM, so closing the
# terminal (or Ctrl-C) always kills the background http.server —
# no orphan listeners left behind.
set -u
PORT="${PORT:-8903}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../demo" && pwd)"
# Reset dispositions first: automation shells often ignore INT on entry,
# and entry-ignored signals can't be trapped without this reset.
trap - EXIT INT HUP TERM
python3 -m http.server "$PORT" --directory "$DIR" &
SRV=$!
cleanup() { kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null; }
trap cleanup EXIT INT HUP TERM
wait "$SRV"
