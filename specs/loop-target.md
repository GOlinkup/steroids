# LOOP-1 visual target spec — island chat/team like coucou (literal values)

Ref canvas: `chat.png` 1080x620 (coucou `docs/media/chat.png`). All px at that ref.
Src: [chat.png] = measured PIL samples; [frame168] = coucou-frames/frame-0168.png;
[burst]/[canvas] = glance anim sheets; [SPEC] = docs/coucou-study/docs/SPEC.md;
[REVIEW] = specs/v0.1.1-REVIEW.md:17 (thin: chat images live, nothing else).

## 1. Chat panel (chat.png)
- Panel: x21–1058 (w1037), y136–493 (h357), fill vertical gradient #191b2b top → #161620 bottom. Corner radius ~28 (approx, verify-by-shot).
- Icon bar above panel: home, chat-bubble, + left; gear, speaker right. Icons ~22px, stroke #e8e8ea, no labels (icons-only).
- Active icon: pill backdrop 48x36, r18, fill #26262e (chat bubble in ref). Inactive: bare icon.
- Contrast fallback: 35%-black scrim, r12, behind icon row when wallpaper is light.
- Claude pill: x187–266 (w79, h~30), r15, fill #25262b; green dot #2ed59a Ø8 at left inset 10; label white ~14px.
- User bubble: x808–989 (w181, h30), r15 (stadium), fill #26262e; white text ~15px, right-aligned, inset 14.
- Typing dots: 3 dots Ø~6, gap ~8, grey (approx, verify-by-shot).
- Input bar: x22–1057 full panel width, fill #272733→#2f314a, r16, h~48; placeholder grey ~14px.
- Send: white circle Ø30 at right inset 12 inside input; dark up-arrow glyph centered.

## 2. Mascot (chat.png + frame168)
- Body: 85x64 white-lavender #e1dbf2, squircle r~22.
- Eyes: 2 black vertical ovals ~6x10, centers spaced ~20, mid-body height.
- Badge: purple circle Ø~22 overlapping top-left edge; bg dark purple (approx #2a1a5e, verify-by-shot); white glyph.
- Work view (frame168, 760x450): agent column LEFT (mascot + name + provider + checklist), work panel RIGHT (diff/code). Layout rule: agent-left / work-right, agent col w~150 at 760 ref (scale linearly).

## 3. Pill rule (human-direct)
- Every agent pill IDENTICAL: 132x34, r17 [SPEC §pastilles]. Mascot pill = hidden pill = same 132x34, one value.
- Pill anatomy: fill agent-color 13%, border 32%, mini Ø24 centered 17 from left edge, label 12px lightened 25%. Grid gap 8.

## 4. Ambient motion (burst + canvas sheets + SPEC §4)
- Open: 520ms spring cubic-bezier(.32,1.22,.42,1); close: 340ms cubic-bezier(.45,0,.2,1) [SPEC].
- Edge light sweep on expand: 2–3px glow line along island lip, blue → amber, ~500ms [burst0 f00–f05].
- Content: out 160ms (opacity 0); in 300ms with 160ms delay after container starts [SPEC]; chat rows stagger ~35ms/row [canvas0 f00–f05 + SPEC].
- Idle: eye-track pointer; blink = eyes scaleY 1→0.1→1 over 180ms every ~4s (verify-by-shot).
- Task ticker: 2.8s cycle, rise 30pt over 450ms cubic-bezier(.3,.9,.3,1); shimmer sweep 2.2s [SPEC].

## 5. Skills for Kevin (ambient/layout)
1. `motion-canvas` — sweep/stagger/spring values. 2. `frontend-design` — tokens/layout. 3. `react-component-performance` — 60fps budget.

## 6. Verify rubric (pending Kevin round-1)
- Per fix: pass/fail vs the numbers above (values, not shape). Score every after-shot 1–10 with reason; round closes only if scores climb vs before-shots.
