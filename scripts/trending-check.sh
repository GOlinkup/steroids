#!/usr/bin/env bash
# Weekly trending-skills discover (report-only, never auto-installs).
# Skills are executable markdown: auto-install = supply-chain risk.
# Human runs `steroids --install-skill owner/repo:path` for anything listed.
# Called from nightly.sh on Mondays; also runnable standalone.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/reports/trending-$(date +%F).md"
command -v gh >/dev/null || { echo "gh missing"; exit 0; }
{
  echo "# Trending agent-skills $(date +%F)"
  echo
  echo "Report-only. Install with: steroids --install-skill owner/repo:path/to/skill"
  echo
  gh search repos --topic agent-skills --sort stars --order desc --limit 15 \
    --json fullName,stargazersCount,updatedAt,description \
    --jq '.[] | "- **\(.fullName)** (\(.stargazersCount) stars, updated \(.updatedAt[:10])) — \(.description // "" | .[:120])"'
} > "$OUT" 2>/dev/null && echo "wrote $OUT" || echo "trending check skipped (offline?)"
