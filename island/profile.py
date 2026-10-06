#!/usr/bin/env python3
"""Island profile — mirror-only, never a minted identity.

Single source per field (grep-auditable, see below): the mirror reads
linked-account state (r4 socials write it; until then the island is
honestly unlinked). No users table, no identity writes anywhere here.
unlink() removes local link tokens — the one sanctioned write.

Sources:
  user_id/handle/avatar/verified <- links file (r4 social accounts)
  bio/links[]                     <- linked socials (r4); empty until linked
  counts (gigs_done/gigs_saved)   <- gigs store (operator rows + saves)
"""
import json
import os

LINKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "profile_links.json")

EMPTY = {"user_id": "", "handle": "", "avatar_url": None,
         "bio": None, "links": [], "verified": False,
         "gigs_done": 0, "gigs_saved": 0}


def _links():
    try:
        with open(LINKS_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def mirror():
    """Link -> profile appears. Unlinked -> honest empty, never invented."""
    links = _links()
    if not links.get("user_id"):
        return dict(EMPTY)
    return {"user_id": str(links.get("user_id") or ""),
            "handle": str(links.get("handle") or ""),
            "avatar_url": links.get("avatar_url"),
            "bio": links.get("bio"),
            "links": list(links.get("links") or []),
            "verified": bool(links.get("verified", False)),
            "gigs_done": int(links.get("gigs_done") or 0),
            "gigs_saved": int(links.get("gigs_saved") or 0)}


def unlink():
    """Remove local link tokens. Returns empty as proof. Missing -> empty."""
    try:
        os.remove(LINKS_FILE)
    except OSError:
        pass
    return dict(EMPTY)
