#!/usr/bin/env python3
"""CHAT-FOLLOW FREEZE — human order 2026-10-11: when chatting, the message
log keeps a visible modern bar and focus pushes to the text the AI is
working on after a send, while a scrolled-up reader is never yanked.
Structural contract (not a hash — Cards.tsx stays open for content work):
the follow mechanisms below must keep existing. Genuine redesigns need a
human order; then update this test first.

Run: python3 tests/test_chat_follow.py
"""
import os
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


class ChatFollowTest(unittest.TestCase):
    def test_send_resticks(self):
        src = _read('island-ui/src/components/Cards.tsx')
        # submit + saveEdit + regenLast + thinking-start = 4 re-stick sites.
        self.assertGreaterEqual(
            src.count('stick.current = true'), 4,
            "CHAT FOLLOW FROZEN: sends must re-stick follow "
            "(submit/saveEdit/regen/thinking-start). Count fell below 4.")

    def test_manual_override_intact(self):
        src = _read('island-ui/src/components/Cards.tsx')
        self.assertIn('el.scrollHeight - el.scrollTop - el.clientHeight',
                      src, "CHAT FOLLOW FROZEN: scroll-up manual override "
                           "threshold missing from onLogScroll.")
        self.assertIn('}, [messages, thinking, livePartial]);', src,
                      "CHAT FOLLOW FROZEN: bottom-pin on messages/thinking/partial "
                      "effect missing.")

    def test_stream_follow_intact(self):
        src = _read('island-ui/src/components/Cards.tsx')
        self.assertIn('new ResizeObserver', src,
                      "CHAT FOLLOW FROZEN: ResizeObserver stream-follow missing.")

    def test_modern_bar_intact(self):
        css = _read('island-ui/src/index.css')
        for marker in ('scrollbar-gutter:stable',
                       'overscroll-behavior:contain',
                       'scrollbar-color:rgba(255,255,255,.38) transparent'):
            self.assertIn(marker, css,
                          "CHAT FOLLOW FROZEN: chat-log modern bar marker "
                          "missing: %s" % marker)


if __name__ == "__main__":
    unittest.main(verbosity=2)
