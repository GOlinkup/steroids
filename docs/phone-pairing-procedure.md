# Phone pairing procedure — v0.1.1 island (5 steps, human executes)

Serve: single bridge on LAN. Phone: `http://192.168.43.237:8905/?app=1` (same WiFi).
Static verdict: pair UI WORKS — one topology rule below, or pairing silently fails.

## Step 0 — PC: rebuild + start the ONE bridge on :8905 (human, 2 min)

```bash
cd /home/TWIG/steroids/island-ui && npm run build
cd /home/TWIG/steroids && python3 island/bridge.py --serve --host 0.0.0.0 8905
```

Rules: this must be the ONLY bridge running (stop any :8096 bridge first —
two bridges = split-brain: the knock never reaches the PC, drops never route).
The desktop Electron island feeds from :8096 (`island-app/main.js:9`), so it
goes dark during pairing; relaunch it after via `island-app/run.sh`.
Confirm: `curl -s http://127.0.0.1:8905/health` → 200.

## Step 1 — Phone (same WiFi): open the island

Open `http://192.168.43.237:8905/?app=1` in the phone browser
(or scan the PC's "Scan to get the app" QR: Settings → Phone link).

## Step 2 — Phone: knock

Avatar (top-right) → **Phone link** → **Link this phone**.
Stays on "Waiting for PC…" up to 5 min — the knock expires after 5 min,
then knock again.

## Step 3 — PC: Allow (within 5 min)

On the PC open `http://127.0.0.1:8905` in a browser tab
(localhost = owner: only localhost may approve).
Island bot says "📲 Phone wants to link" → avatar → **Phone link** → **Allow**.
Phone flips to "Linked" badge; PC says "phone allowed — linked".

## Step 4 — Drop both ways (verify)

- PC → phone: chat `+` → attach a file → **drop to phone**
  (or Shelf → Send-to-phone). Expect "Sent 1 file to phone ✓".
- Phone → PC: attach/send on the phone. Bytes land in the PC chat.
- Offline either side: files queue and fire on link ("queued — pairing fires
  the rest"). Big files stream chunked + resume on retry.

## Step 5 — Done: unpair or resume desktop

Unpair from either side: Settings → Phone link → **Unpair**.
To resume the desktop island: stop :8905, `island-app/run.sh` (bridge :8096 back).

## If it fails

- "bridge not reachable — same WiFi as the PC?" → phone not on same LAN,
  or Step 0 serve not up.
- "approve failed — knock again" → Allow tapped after 5-min expiry, or TWO
  bridges running (kill the extra, single :8905 only).
- "approve on the PC itself" → Allow must be tapped on the PC tab, never the phone.
