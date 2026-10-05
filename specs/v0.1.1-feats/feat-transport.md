# Free feats — transport (ideas 1–5)

Outcome: the paired PC↔phone pipe does more than file drop — input,
locate, backup, guard, and safe-conflict handling, all keyless and
on-device. Builds on Sprint 1 transport (pairing + LAN + drop).

Task F-1: phone as mouse + keyboard (transport)
Description: phone screen becomes a wireless touchpad + keyboard for the
  paired PC over the LAN pipe (KDE Connect virtual-touchpad technique).
  No new pairing — reuses Sprint 1 trust.
Do-not-touch: file-drop payload path (input events only, separate channel)
Acceptance:
- [ ] tap/drag on phone moves the PC cursor; tap = click
- [ ] phone keyboard types into the focused PC window
- [ ] input stops the moment pairing is revoked (no orphan control)
Verification: type a sentence + click a target on test PC; revoke pairing mid-session, input must die
Dependencies: Sprint 1 pairing + LAN (V0.1.1-1-1..3)
Files likely touched: new input module (native, lane owner decides)
Size: M

Task F-2: find-my-device ring (transport)
Description: PC triggers the paired phone to ring at max volume (and phone
  can trigger PC speaker), even if the ringer is on silent — LAN only, no
  cloud account, no GMS.
Do-not-touch: notification content (ring signal only, no message payload)
Acceptance:
- [ ] ring fires on silent-mode phone over LAN within seconds
- [ ] ring stops from either end (phone button or PC cancel)
- [ ] unpaired devices cannot trigger a ring (refused loudly)
Verification: silent phone across the room ×2 runs; spoofed trigger from unpaired device must refuse
Dependencies: Sprint 1 pairing
Files likely touched: new ring module both ends
Size: S

Task F-3: photo backup pull (transport)
Description: new camera photos auto-pull phone→PC over LAN when paired and
  on unmetered WiFi. Never silent-overwrites (see F-5); progress honest;
  phone keeps originals until user deletes.
Do-not-touch: cloud backup SDKs (on-device only, no accounts)
Acceptance:
- [ ] only photos newer than last backup pull transfer
- [ ] interrupted pull resumes, never restarts from zero
- [ ] metered connection pauses the pull with a visible reason
Verification: seed 20 photos, pull, add 5, pull again — only 5 move; kill mid-pull, resume
Dependencies: Sprint 1 drop; F-4 (guard); F-5 (conflict-safe)
Files likely touched: new backup module
Size: M

Task F-4: data guard (transport)
Description: the zero-mobile-data guarantee, enforced. Transfers refuse or
  pause on metered connections unless the user explicitly allows; hotspot-AP
  mode (no data-plan use, per recon) is allow-listed as unmetered.
Do-not-touch: transfer engine internals (gate only, at session start + on network change)
Acceptance:
- [ ] metered-network transfer attempt shows cost warning before any byte moves
- [ ] network flip mid-transfer pauses with resume offered, never burns data silently
- [ ] hotspot-AP mode transfers without warnings (proven zero-plan-use)
Verification: toggle metered flag mid-transfer; hotspot run with data-counter proof
Dependencies: Sprint 1 drop
Files likely touched: guard hook at session start + connectivity listener
Size: S

Task F-5: conflict-safe drops (transport)
Description: same-name arrivals never silently overwrite. Default: keep-both
  with honest rename (`name (2).ext`); per-transfer choice offered
  (keep-both / replace / skip); photo backup inherits this behavior.
Do-not-touch: checksum verification (still runs after resolution, unchanged)
Acceptance:
- [ ] same-name drop keeps both files, names shown honestly in receipt
- [ ] replace requires explicit user tap per conflict (no global silent-overwrite switch)
- [ ] checksum still verified on the final written file
Verification: drop same file ×3, all three present and byte-correct
Dependencies: Sprint 1 drop
Files likely touched: transfer receive path (rename policy)
Size: S

## LEVEL-UP (transport)

Improvements to the five above:
- One trust for all: F-1..F-4 ride the single Sprint 1 pairing — no
  per-feature PIN, revocation kills every channel at once.
- F-3 + F-4 fuse: backup pull is the first client of the data guard, so
  the metered-path is proven before any other background transfer exists.
- F-5 default-on everywhere: photo backup and future drops inherit
  keep-both; replace stays a per-conflict explicit tap.

New free-only ideas (one line each):
- F-T6: batch drop queue with pause/resume per file, honest ETA + speed readout on the PC island.
- F-T7: auto-reconnect on network flap — session survives WiFi↔hotspot switch without re-pairing.
- F-T8: clipboard explicit-send both ways (Send-tap UX from recon; Android 10+ blocks silent sync, so tap-to-send is the whole feature).
