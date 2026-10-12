#!/usr/bin/env bash
# 1-click PC mode: local sandbox (free, no keys), runs in HOME not the jail.
# Usage: ./island-pc.sh   (safe default without it: ./island-app.sh stays jailed)
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export SANDBOX_PROVIDER=local STEROIDS_PC_FULL=1
exec "$REPO/island-app.sh" "$@"
