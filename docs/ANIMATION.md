# Island animation one-sheet

Every light/motion state, when it shows, and for how long. Source of truth
for the Glance-parity pass (burst frames in `~/Pictures/glance-frames/`).

## Ambient (always on, idle)

| Element | When you see it | Look | Timing |
|---|---|---|---|
| Perimeter line | Minimized pill, any idle moment | Thin blue `#7dbdff` trace hugging the pill + soft blue halo | Static, no motion |
| Mascot | Same | Breathe + blink on independent loops | Continuous |

## Working (agent turn running)

| Element | When you see it | Look | Timing |
|---|---|---|---|
| Edge ring | Pill, turn with known steps | Blue ring parked at the REAL step ratio (`done/total`), grows left→right as steps finish | 2s refresh, no loop — determinate |
| Edge ring | Pill, turn with no steps yet | Faint static ring + halo breathe | Until first step lands |
| Halo breathe | Whole island | Amber breathing glow | 2.6s loop |
| Orb | Chat working bubble | `searching` / `solving` / `composing` / `working` face | Follows live signal |
| Status text | Same bubble | Live activity shimmer | Streams |
| Mic | Recording a voice note | `listening` orb in the mic button | While recording |

## Urgent (approval / question waiting)

| Element | When you see it | Look | Timing |
|---|---|---|---|
| Perimeter line | Pill | Parks FULL amber `#fbbf24`, no motion | Held until answered |
| Halo | Whole island | Orange urgent pulse | 1.1s loop |
| Open panel bar | Chat, below navbar | Solid amber 2px hold + glow | Held until answered |

## Echo (copy / volume / brightness keys)

| Element | When you see it | Look | Timing |
|---|---|---|---|
| Edge sweep | Pill | Blue-white head sweeps start→end once, level ring parks | 0.9s sweep, ring melts 1.2s after release |
| Line draw | Pill | Same perimeter draw as working | While the ring shows |
| Black bar | Open panel navbar | Navbar goes black, `📋 Copied <text>` centered | 2.6s, then melts |
| Minimized pill | Collapsed | Pill swells with `📋 <text>` | 2.6s |
| Sound | Any echo | `huddleConnect` blip on show (muted → silent) | Instant |

Copy sources: system clipboard (main-process 700ms poll covers copies
made anywhere, DOM `copy` event covers the rest) + in-app copy buttons
(announce via echo event) + `paste` inside the island. Pastes made
outside the island are unobservable (paste never touches the
clipboard). Music keys arrive as volume events; track progress does
NOT drive the ring (open item).

## Open / close (coucou SPEC §4 values)

| Transition | Timing | Curve |
|---|---|---|
| Min → big (open) | 520ms, width + height together, content clipped inside until open | Spring overshoot `cubic-bezier(.32,1.22,.42,1)` |
| Big → min (close) | 340ms, flat, content clipped while shrinking | `cubic-bezier(.45,0,.2,1)` |
| Panel content in | 300ms, starts 160ms after the container starts growing | `ease-out` |
| Overflow flip | `visible` lands only after the 520ms open (`allow-discrete`); snaps to `hidden` the instant close starts | — |
| Huddle poke | Mascot wave + jump, silent | Every 9s |
| Huddle cues | `connect` on show, pitch-ladder `pop` on mascot tap, `chime` on first send | Instant |

Auto-collapse: jacked → flex after 15s idle, flex → hidden after 60s
(`setAutoClose` overrides both). Countdown/hold states follow the app
settings, not this sheet.

## Deliberately NOT animated (UX rules)

- Exit: content unmounts instantly on close (no 160ms fade — open path only).
- Reduced motion: ALL of the above parks static under
  `prefers-reduced-motion` (line full, no sweep/draw/pulse).
- No animation invents state: every motion above is keyed to a real
  signal (turn, approval, echo, key press). Idle never performs work.
