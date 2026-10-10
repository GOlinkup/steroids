# Steroids — Away-from-Home Without Our Servers (FREE, self-hosted)

The relay protocol (QR → PIN → key → WS frames) works over any TCP — proven
in-loop via raw socket + Deno client. Away-from-home is therefore a
reachability setup, not a Steroids feature to wait for. Three free paths,
easiest first. Hosted zero-setup relay remains the premium offer
(see PREMIUM.md "Managed Remote Access").

## Option A — Tailscale (easiest, recommended)

1. Install Tailscale on the PC and the phone (free personal plan).
2. Start the bridge on all interfaces: `python3 island/bridge.py --serve --host 0.0.0.0`
3. On the phone (same Tailscale net), open `http://<pc-tail-ip>:8096`, pair once via Settings → Phone link.
4. Done. Works from anywhere, encrypted WireGuard, no ports opened.

## Option B — SSH reverse tunnel (no new accounts)

From the PC (needs any reachable SSH host):

```
ssh -R 8096:localhost:8096 user@your-server -N
```

Then on the phone: `http://your-server:8096` (lock it down: SSH `GatewayPorts no`
+ key-only auth, or bind the forward to 127.0.0.1 and SSH from the phone via
Termux/JuiceSSH with a `-L 8096:localhost:8096` forward, then open
`http://127.0.0.1:8096` on the phone).

## Option C — Phone hotspot / travel router

Phone hotspot on, PC joins it: you are back on "same WiFi" — pair normally.
No setup beyond the hotspot.

## Live dev-server preview on the phone (FREE #7)

Same link, no extra feature: with any option above, open your dev server
(`http://<pc-ip>:<dev-port>`, e.g. Vite :5173) directly in the phone browser.
The app runs on the PC, renders on the real phone. For a one-tap card inside
the island UI, see queued item #81 in LOOP-REVIEW.md.

## Security notes

- Pairing owns access: no PIN/key, no frames. Keys are 128-bit, rooms isolated.
- Sensitive endpoints (approve taps, local-key mint, link-approve) are
  localhost-only on the bridge — over a tunnel they run from the PC side.
- Never expose 8096 to the open internet without auth in front. Prefer A.
