---
name: steroids
description: Universal AI skill router and CLI accelerator. Automatically indexes, matches, and recommends skills across Antigravity, Claude Code, OpenCode, and terminal workflows. Use for finding skills, routing prompts to specialized playbooks, launching the floating 2D canvas UI, or managing the skill index.
---

# Steroids

Steroids is a universal skill router and accelerator for AI pair programmers (Antigravity, Claude Code, OpenCode, and Terminal CLI). It indexes installed skills across all agent directories, analyzes user prompts, and recommends the most relevant skills with closed-loop memory.

## CLI Commands

The CLI binary is installed globally in `$PATH` at `~/.local/bin/steroids`.

### Route a task prompt
```bash
steroids "build a flutter mobile app"
# Output: Possibly relevant skills (load what applies, skip rest): build,flutter -> dart-flutter-patterns/flutter-dart-code-review/orch-build-mvp
```

### Pipe query via stdin
```bash
echo "resolve git rebase merge conflict" | steroids
```

### JSON Output format
```bash
steroids --json "write unit tests with vitest"
```

### View stats & indexed skills
```bash
steroids --count
steroids --list
```

### Force re-index
```bash
steroids --reindex
```

### Floating 2D Canvas UI
```bash
steroids --canvas   # or steroids -u
```

## Integration Points

1. **Terminal CLI**: `~/.local/bin/steroids`
2. **Antigravity CLI**: Configured via `~/.gemini/antigravity-cli/hooks.json` under `PreInvocation` with `--antigravity-hook`.
3. **Claude Code**: Configured via `~/.claude/settings.json` under `UserPromptSubmit`.
4. **OpenCode**: Integrated via `~/.config/opencode/plugins/steroids-plugin.ts` and `/steroids2d` command.
5. **Config & Index**: Cached in `~/.config/steroids/` (symlinked with OpenCode plugin).

## Close the loop (report a miss — fail once, fix for everyone)

A wrong hint is data, not trash. If steroids sends you to the wrong skill:

```bash
steroids --correct <words from the task> --skill <skill that should have matched>
steroids outcome <skill> ok|bad   # task-level verdict when it mattered
```

What happens next, automatically: tonight's run mines your correction into
the shared pool; once a fix is confirmed across days/users it ships back as
a shared rule and the router stops making that mistake — for you and for
everyone. No prompts, no query text, no ids ever leave the machine (trigram
tokens + counters only; `STEROIDS_NO_SHARE=1` opts out entirely).
