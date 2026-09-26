#!/usr/bin/env python3
"""Steroids IDs (P1-2): sortable, unique, human-readable. Stdlib only."""
import os
import random
import re
import time

_FMT = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{16}$")

def new_id(prefix=""):
    # ponytail: time + pid + rand; sortable by time, unique over 1000 fast calls.
    t = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
    rand = "%016x" % random.getrandbits(64)
    return f"{prefix}{t}-{rand}" if prefix else f"{t}-{rand}"

def valid(sid):
    s = sid.split("/")[-1]
    for p in ("run-", "task-"):
        if s.startswith(p):
            s = s[len(p):]
            break
    return bool(_FMT.match(s))

def run_id():
    return "run-" + new_id()

def task_id():
    return "task-" + new_id()
