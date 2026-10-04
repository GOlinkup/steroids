# Story S-V11-2: Mirror + Reply (Sprint 2)

Outcome: every phone notification surfaces on the PC island with inline
reply; replies/replies-typed-offline queue in an offline outbox and fire on
reconnect. No GMS needed anywhere on this path.

Task V11-2-1: notification listener + inline reply (Jim)
Description: Android NotificationListenerService + RemoteInput; mirror to
  island, reply from PC lands back on the phone. No GMS dependency.
Do-not-touch: transfer code (Sprint 1 transport reused as-is)
Acceptance:
- [ ] phone notification appears on PC island within seconds
- [ ] PC-typed reply delivers to the originating app
- [ ] listener permission flow explains itself (no dead permission screen)
Verification: 3 apps × notify + reply round-trip; permission denied path shows guidance
Dependencies: none (starts on human sprint sign-off; runs parallel to Sprint 1)
Files likely touched: new notifier module (native)
Size: M

Task V11-2-2: self WS relay + foreground service (Jim)
Description: cross-device relay over our own socket; foreground service +
  battery exemption for no-GMS survival (FCM is dead on Huawei).
Do-not-touch: ntfy/UnifiedPush unless relay proves insufficient (escalation, not default)
Acceptance:
- [ ] relay survives screen-off for a full workday (or kill documented + exemption steps)
- [ ] reconnect after network switch without re-pairing
- [ ] battery cost stated honestly (settings shows it)
Verification: 8-hour background run; WiFi→hotspot switch without re-pair
Dependencies: V11-2-1
Files likely touched: relay module + service declaration
Size: M

Task V11-2-3: offline outbox (Jim)
Description: anything typed offline (replies, orders, tasks) queues durably
  and fires in order on reconnect — this is what makes "no internet still
  useful" real, not just transfers.
Do-not-touch: send paths (queue wraps them, never rewrites them)
Acceptance:
- [ ] airplane-mode reply sends automatically on reconnect, exactly once
- [ ] outbox visible (pending count), cancellable before fire
- [ ] duplicates impossible on flaky reconnect (idempotency key per item)
Verification: airplane toggle ×3 with packet capture or log proof of single delivery
Dependencies: V11-2-2
Files likely touched: outbox store + queue module
Size: S

Task V11-2-4: device proof on Huawei (human + Jim)
Description: reply round-trip + background survival on the human's device.
Do-not-touch: code (proof only)
Acceptance:
- [ ] human replies to a real message from the PC island, confirms delivery
- [ ] background-kill behavior documented or exempted
Verification: human 2-minute taps, report back what was seen
Dependencies: V11-2-3
Files likely touched: none (report only)
Size: XS

Checkpoint CP-V11-2: after T2-3 — mirror + reply + outbox demoed end to
end before Sprint 4 (socials) builds reply on this path.
