---
name: asset-fetch
description: Download free 3D models, rigs, and motion-capture clips for Blender and game work. Finds direct file URLs on Sketchfab free section, Mixamo, Quaternius, poly.pizza, Kenney, CMU mocap, and downloads them with verification. Use when the task needs an asset file, 3D model, character rig, animation clip, mocap data, or anything to download and use.
needs: [asset-url-or-query]
proof: [asset-sourced]
---

# Asset Fetch

Turn "I need a robot model" into a verified file on disk. Search first, download second, verify third.

## Recipe (agent executes; router has no network client)

1. **Search** via `exa-web-search` for `<subject> free download filetype:glb OR filetype:fbx OR filetype:blend`.
   Prefer direct-file hosts, in order: raw GitHub / `poly.pizza` / Quaternius pack zip / Kenney / Sketchfab free page / Mixamo.
2. **Resolve to a direct file URL.** Listing pages (Sketchfab/Mixamo search) are JS-walled and login-gated — they are NOT downloadable. Keep going until you hold a URL ending in `.glb`, `.fbx`, `.blend`, `.zip`, or `.bvh`.
3. **Download + verify** (stdlib only, never raises):
```python
import urllib.request, struct, os
req = urllib.request.Request(URL, headers={"User-Agent": "Steroids-probe/1.0"})
with urllib.request.urlopen(req, timeout=30) as r, open(DST, "wb") as f:
    f.write(r.read())
assert os.path.getsize(DST) > 0
with open(DST, "rb") as f:
    assert f.read(4) == b"glTF"  # for .glb; skip for .zip/.fbx
```
4. **License check before use:** CC0 = anything. Mixamo/Sketchfab-free = ship inside a finished work, never redistribute raw files. When in doubt, abstain and ask.

Proven with `Duck.glb` (120KB, glTF v2, 1 mesh) — see router history.
