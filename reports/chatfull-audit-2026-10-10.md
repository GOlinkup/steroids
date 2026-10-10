# chatfull audit — v0.1.1 full-chat surface (read-only, 2026-10-10, jim-mv1tlrtz)

Ref: coucou `docs/media/chat.png` (fetched raw, matches `specs/loop-target.md` §1).
Scope: real tree `/home/TWIG/steroids`. Zero edits. Foreign WIP live (102 touched files) — reads only.

## Component map (chat view)

- `island-ui/src/App.tsx:105` — `view` state, default `"chat"`; `:1914` renders `<Island view={view}>`.
  `sendChat` / `resumeSession` / `newChat` / `editMessage` / regen callbacks live here.
- `island-ui/src/components/Island.tsx:358-399` — `view==="chat"` → `<ChatPanel>` + `teamNode`
  (empty-state `Huddle` + `TeamGrid` crew rail, always mounted).
- `island-ui/src/components/Cards.tsx:275-975` — `ChatPanel`: `.chat-log` rows (`:593-710`),
  `.reply.working` thinking bubble (`:711-754`), thought receipt (`:755-759`), attach chips
  (`:761-778`), no-agent install card (`:779-798`), composer (`:799-972`).
- `island-ui/src/components/Header.tsx:16-23,217-244` — icon-bar tabs
  (chat/daily/explore/feed/lens/shelf) + history / bell / avatar actions.
- Data: `island-ui/src/store.ts` (`ChatMessage`/`ChatSession`/`AgentSession`), `island-ui/src/sync.ts`
  (cloud merge + tombstones), `Cards.tsx:989` `md()` lite renderer (no dep, no innerHTML).
- Style: `island-ui/src/index.css` chat block (~`:333-506`, `:663-676`).

## Ranked gaps vs loop-target §1 (+§3)

1. **Typing dots missing.** `.typing` CSS exists (`index.css:463-466`, 3×Ø6) but is never
   rendered in any tsx (only comment mention `Cards.tsx:501`). Thinking shows the
   `.reply.working` orb bubble instead. Spec §1: 3 dots Ø~6 gap ~8.
2. **No assistant pill.** Assistant turns are full-width `.reply` cards (`index.css:390`),
   not the 79×30 Claude pill w/ green dot. User `.bubble` (`:389`) is max-85% card,
   left-aligned text — not the right-aligned stadium w181 r15.
3. **Icon-bar drift.** No `+` new-chat affordance in the bar (only inside history panel,
   `Header.tsx:283`); no gear/speaker right (gear removed → avatar menu per `:206`;
   no speaker anywhere); active state is `.tab.on`, not the 48×36 r18 pill backdrop.
4. **Send button.** Idle = grey translucent 32px (`:476`), ready = gradient (`:477`);
   ref = white circle Ø30 always. Close, but idle state mismatches.
5. **Composer placeholder.** `Ask {model} anything…` (`Cards.tsx:868`) vs ref `Continue...`. Copy nit.
6. **Panel geometry (likely deliberate).** `.card.chat-card` is transparent/borderless
   (`:664`); ref = gradient panel #191b2b→#161620 r28 with full-width input bar.
   Island shell styling, not chat-panel bug — flag for Kevin, don't "fix" blind.
7. **Pill rule §3 not applied in chat.** No 132×34 anywhere (css grep clean); crew renders
   as TeamGrid tiles, chat has no agent pills. If the rule stands, chat needs a pill pass.
8. **Mascot placement.** Ref shows mascot buddy bottom-left inside panel; ours mounts
   `.mascot-top` only for non-chat views (`Island.tsx:315` excludes chat). Empty chat shows
   Huddle + grid instead. Minor.
9. **Dead CSS.** `.typing` (`:463-466`) unreferenced — remove if dots stay out, or wire it (see #1).

## What's solid (no action)

Chat images live (REVIEW 10/10), inline bubble edit + save&resend (`:467-499`), regen-last
(`:494`), copy/vote actions, voice-note attach (`:544-564`), send→stop morph (`:966-970`),
draft survives reloads (`:344-367`), log pins to bottom (`:434-438`), tombstoned deletes,
install card honest-empty state. Markdown-lite is XSS-safe (text nodes only).
