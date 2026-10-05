# Story S-V0.1.1-1: Pair + Drop (Sprint 1)

Outcome: phone and PC pair once over QR+PIN, then files drop either way —
same WiFi first, phone-hotspot fallback when apart, zero mobile data, fully
offline-capable. Checkpoint CP-V0.1.1-1 after T1-3 (paired drop demoed both
directions before Daily builds on the transport).

Task V0.1.1-1-1: QR+PIN pairing with TLS (Kevin)
Description: pair once, trust forever. QR carries the cert fingerprint +
  endpoint; PIN opens the session; platform TLS after (no in-tree E2E libs
  exist — stdlib has no AES-GCM/X25519, per recon).
Do-not-touch: golinkup auth (separate system, Sprint 4 reuses it untouched)
Acceptance:
- [ ] QR scan pairs a fresh phone + PC with zero typing
- [ ] wrong PIN or fingerprint mismatch refuses loudly, no silent pair
- [ ] re-pair after unpair takes under a minute
Verification: pair/unpair cycle on test devices; attempt spoofed fingerprint, must refuse
Dependencies: none (starts on human sprint sign-off)
Files likely touched: new pairing module (native, lane owner decides)
Size: M

Task V0.1.1-1-2: LAN discovery + announce (Kevin)
Description: devices find each other on the LAN without typing IPs.
  Multicast announce (224.0.0.0/24 Android-safe range, LocalSend technique).
Do-not-touch: transfer code (announce only, no payload here)
Acceptance:
- [ ] phone appears on PC island within seconds of joining the WiFi
- [ ] leaving the network removes it (no ghost entries after timeout)
- [ ] manual-IP fallback exists for hostile networks (hotel WiFi)
Verification: join/leave cycle ×2 networks; one hostile-network fallback proof
Dependencies: V0.1.1-1-1
Files likely touched: new discovery module
Size: S

Task V0.1.1-1-3: file drop both directions + hotspot fallback (Kevin)
Description: drag-to-top sends either way over HTTPS :53317 (LocalSend
  technique); phone-hotspot AP is the same path when no shared WiFi; resume
  on interrupt; sizes shown honestly before sending.
Do-not-touch: clipboard/screenshot paths (explicit-send UX, separate task later)
Acceptance:
- [ ] PC→phone and phone→PC both land byte-identical (checksum proof)
- [ ] hotspot-mode transfer uses zero mobile data
- [ ] interrupted transfer resumes, never restarts silently
Verification: checksum diff both directions ×2 networks; data-counter screenshot on hotspot run
Dependencies: V0.1.1-1-2
Files likely touched: new transfer module
Size: M

Task V0.1.1-1-4: device proof on Huawei (human + Kevin)
Description: the two known-unknowns from recon — Huawei background-kill and
  OEM hotspot quirks — can only be proven on the human's device.
Do-not-touch: code (proof only)
Acceptance:
- [ ] drop works with screen off / app backgrounded (or kill behavior documented with exemption steps)
- [ ] hotspot-mode drop completes on the human's Huawei
- [ ] quirks filed as follow-ups, not silent
Verification: human 2-minute taps per case, report back what was seen
Dependencies: V0.1.1-1-3
Files likely touched: none (report only)
Size: XS

Checkpoint CP-V0.1.1-1: after T1-3 — paired drop demoed both directions,
human device proof (T1-4) before Sprint 3 builds on this transport.
