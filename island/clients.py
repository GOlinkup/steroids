"""Client registry — port of ping-island's ClientProfile.swift.

One table: client id -> hook location + behaviour. Adding a new
Claude-compatible agent = one row here, zero new switches elsewhere.
Apache-2.0 source (erha19/ping-island); see NOTICE.
"""
import os

# kind: how the hook payload looks. 'claude' = hook_event_name/tool_name
# style (Claude, Gemini, Qwen, Kimi, Cursor, Qoder, CodeBuddy, Copilot
# all speak it). 'opencode' = our {kind: ...} plugin payload.
# blocking: client honours an island approve/deny/answer (Claude
# PermissionRequest / AskUserQuestion style). notify-only clients
# (IDE shells) just surface text.
CLIENTS = {
    'claude': {'hooks': '~/.claude/settings.json', 'kind': 'claude',
               'blocking': True, 'mascot': 'orange', 'label': 'Claude Code'},
    'opencode': {'hooks': '~/.config/opencode/plugins/steroids-events.ts',
                 'kind': 'opencode', 'blocking': True, 'mascot': 'orange',
                 'label': 'OpenCode'},
    'gemini': {'hooks': '~/.gemini/settings.json', 'kind': 'claude',
               'blocking': False, 'mascot': 'blue', 'label': 'Gemini CLI',
               'note': 'regex matchers: use .* not *'},
    'qwen': {'hooks': '~/.qwen/settings.json', 'kind': 'claude',
             'blocking': True, 'mascot': 'mint', 'label': 'Qwen Code'},
    'kimi': {'hooks': '~/.kimi/config.toml', 'kind': 'claude',
             'blocking': True, 'mascot': 'orb', 'label': 'Kimi CLI',
             'note': '[[hooks]] array-of-tables; legacy ~/.kimi-code/config.toml'},
    'codex': {'hooks': '~/.codex/config.toml', 'kind': 'claude',
              'blocking': True, 'mascot': 'teal', 'label': 'Codex CLI',
              'note': 'rollout JSONL fallback when hooks absent'},
    'cursor': {'hooks': '~/.cursor/hooks.json', 'kind': 'claude',
               'blocking': False, 'mascot': 'gray', 'label': 'Cursor'},
    'qoder': {'hooks': '~/.qoder/settings.json', 'kind': 'claude',
              'blocking': False, 'mascot': 'gray', 'label': 'Qoder'},
    'codebuddy': {'hooks': '~/.codebuddy/settings.json', 'kind': 'claude',
                  'blocking': False, 'mascot': 'gray', 'label': 'CodeBuddy'},
    'copilot': {'hooks': '~/.copilot/hooks.json', 'kind': 'claude',
                'blocking': False, 'mascot': 'gray', 'label': 'Copilot'},
}


def get(client):
    return CLIENTS.get(str(client or '').lower() or 'claude', CLIENTS['claude'])


def ids():
    return sorted(CLIENTS)


def hook_path(client):
    return os.path.expanduser(get(client)['hooks'])


def blocking(client):
    return bool(get(client)['blocking'])
