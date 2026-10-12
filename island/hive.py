#!/usr/bin/env python3
"""Hive: the team's shared floor in plain files. Patterns ported from
HarnessMD/munder-difflin (MIT — see docs/munder-difflin/NOTICE.md):
single-committer log, single-writer-per-file inbox/outbox + router,
FIPA-lite messages with hop caps, a task ledger, markdown-first memory.
Reimplemented here in stdlib Python for the bridge (their stack is
Electron/Node — their code can't run here, the pattern can).

Layout under ~/.config/steroids/hive/ (STEROIDS_HOME fakes it in tests):

  registry.json  roster: [{id, role, status}]
  board.md       shared plan (god scribe only — today: reserved)
  tasks.json     ledger: [{id,title,spec,assignee,status,result,at,updated}]
  log.jsonl      append-only events (UI board polls this)
  agents/<id>/identity.md memory.md inbox/ inbox/.done/ outbox/ cursor.json
"""
import json
import os
import time

ACTS = ("request", "inform", "propose", "query", "agree", "refuse", "done")
# Only these obligate a reply; the rest are terminal (anti ping-pong).
OBLIGATED = ("request", "query", "propose")
# Past this many reply-hops the router escalates to nicki instead of
# letting two mates loop forever.
HOP_CAP = 5
TASK_OPEN = ("todo", "running", "blocked")


def root():
    home = os.environ.get("STEROIDS_HOME") or os.path.expanduser("~")
    return os.path.join(home, ".config", "steroids", "hive")


def _write_json(path, obj):
    tmp = path + ".tmp-%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f)
    os.replace(tmp, path)  # atomic: readers never see half a mailbox


def _read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            out = json.load(f)
    except (OSError, ValueError):
        return default
    if default is None or isinstance(out, type(default)):
        return out
    return default


def _write_text(path, text):
    tmp = path + ".tmp-%d" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def _new_id():
    return "%s-%s" % (time.strftime("%Y%m%dT%H%M%S", time.gmtime()),
                      os.urandom(2).hex())


def agent_dir(aid):
    return os.path.join(root(), "agents", aid)


def ensure():
    """Create the floor. Idempotent, never throws away existing state."""
    r = root()
    os.makedirs(os.path.join(r, "agents"), exist_ok=True)
    if not os.path.isfile(os.path.join(r, "registry.json")):
        _write_json(os.path.join(r, "registry.json"), {"agents": []})
    if not os.path.isfile(os.path.join(r, "board.md")):
        _write_text(os.path.join(r, "board.md"), "# Board\n")
    if not os.path.isfile(os.path.join(r, "tasks.json")):
        _write_json(os.path.join(r, "tasks.json"), {"tasks": []})
    if not os.path.isfile(os.path.join(r, "log.jsonl")):
        open(os.path.join(r, "log.jsonl"), "a").close()
    return r


def append_log(type, **fields):
    """One event on the floor feed. Never throws (callers are hot paths)."""
    try:
        ensure()
        with open(os.path.join(root(), "log.jsonl"), "a",
                  encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "type": type,
                                **fields}) + "\n")
    except OSError:
        pass
    try:  # single-committer: best-effort, never slows/breaks logging.
        commit(str(type))
    except Exception:
        pass


def commit(msg="hive update"):
    """Single-committer git push of the hive dir. Lockfile + 3 tries +
    backoff. Silent fail (False) when git/repo unavailable. Never raises."""
    try:
        import subprocess
        r = root()
        if not os.path.isdir(os.path.join(r, ".git")):
            return False
        lock = os.path.join(r, ".commit.lock")
        for i in range(3):
            try:
                fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.close(fd)
                break
            except OSError:
                if i == 2:
                    return False
                time.sleep(0.05 * (2 ** i))
        try:
            subprocess.run(["git", "-C", r, "add", "-A"], timeout=2,
                           capture_output=True)
            p = subprocess.run(["git", "-C", r, "commit", "-m",
                                str(msg)[:200]], timeout=2,
                               capture_output=True)
            return p.returncode == 0
        except Exception:
            return False
        finally:
            try:
                os.remove(lock)
            except OSError:
                pass
    except Exception:
        return False


def read_log(limit=50):
    try:
        with open(os.path.join(root(), "log.jsonl"),
                  encoding="utf-8") as f:
            rows = f.readlines()[-max(1, limit):]
    except OSError:
        return []
    out = []
    for ln in rows:
        try:
            out.append(json.loads(ln))
        except ValueError:
            continue
    return out


def _tasks_path():
    return os.path.join(root(), "tasks.json")


def list_tasks():
    ensure()
    doc = _read_json(_tasks_path(), {"tasks": []})
    if not isinstance(doc, dict):
        return []
    tasks = doc.get("tasks")
    return tasks if isinstance(tasks, list) else []


def add_task(title, spec="", assignee="nicki", status="todo", result=""):
    """A ledger row. Returns the row (with id)."""
    ensure()
    row = {"id": _new_id(), "title": str(title)[:200],
           "spec": str(spec)[:1000], "assignee": str(assignee)[:40],
           "status": status if status in TASK_OPEN + ("done", "failed")
           else "todo",
           "result": str(result)[:1000], "at": time.time(),
           "updated": time.time()}
    doc = _read_json(_tasks_path(), {"tasks": []})
    tasks = doc.get("tasks") if isinstance(doc, dict) else None
    if not isinstance(tasks, list):
        tasks = []
    tasks.append(row)
    _write_json(_tasks_path(), {"tasks": tasks[-200:]})
    append_log("task", id=row["id"], title=row["title"],
               assignee=row["assignee"], status=row["status"])
    return row


def update_task(tid, **patch):
    """Patch status/result. Returns the row or None."""
    ensure()
    doc = _read_json(_tasks_path(), {"tasks": []})
    if not isinstance(doc, dict) or not isinstance(doc.get("tasks"), list):
        return None
    for row in doc["tasks"]:
        if row.get("id") == tid:
            for k in ("status", "result", "assignee", "title", "spec"):
                if k in patch and patch[k] is not None:
                    row[k] = str(patch[k])[:1000]
            row["updated"] = time.time()
            _write_json(_tasks_path(), doc)
            append_log("task", id=tid, **{k: row.get(k)
                                          for k in ("status", "assignee")})
            return row
    return None


def delete_task(tid):
    """Remove a ledger row. Returns True when something was removed."""
    ensure()
    doc = _read_json(_tasks_path(), {"tasks": []})
    if not isinstance(doc, dict) or not isinstance(doc.get("tasks"), list):
        return False
    kept = [row for row in doc["tasks"] if row.get("id") != tid]
    if len(kept) == len(doc["tasks"]):
        return False
    _write_json(_tasks_path(), {"tasks": kept})
    append_log("task", id=tid, status="deleted")
    return True


def comment_task(tid, text, by="you"):
    """Append one dated comment line to a task's spec. Returns row or None."""
    ensure()
    line = str(text or "").strip().replace("\n", " ")[:300]
    if not line:
        return None
    doc = _read_json(_tasks_path(), {"tasks": []})
    if not isinstance(doc, dict) or not isinstance(doc.get("tasks"), list):
        return None
    for row in doc["tasks"]:
        if row.get("id") == tid:
            prev = str(row.get("spec") or "")
            stamp = "%s — %s: %s" % (time.strftime("%Y-%m-%d"),
                                     str(by)[:40], line)
            row["spec"] = (prev + "\n" + stamp if prev else stamp)[:2000]
            row["updated"] = time.time()
            _write_json(_tasks_path(), doc)
            append_log("task", id=tid, status="comment")
            return row
    return None


def read_board():
    ensure()
    try:
        with open(os.path.join(root(), "board.md"), encoding="utf-8") as f:
            return f.read()[:4000]
    except OSError:
        return "# Board\n"


def write_board(text, agent=None, by=None):
    """God scribe only (nicki/god). Refusals fail silent (False)."""
    actor = by if by is not None else agent
    if actor not in ("nicki", "god"):
        return False
    try:
        ensure()
        _write_text(os.path.join(root(), "board.md"), str(text)[:4000])
        append_log("board", chars=len(str(text)))
        return True
    except OSError:
        return False


def propose_board(agent, text):
    """Non-scribes file a board proposal to nicki's inbox. Never raises."""
    try:
        ensure()
        send_msg(str(agent or "anon")[:40], "nicki", "propose",
                 "board proposal", str(text)[:2000])
        drain()
        return True
    except Exception:
        return False


def roster():
    ensure()
    doc = _read_json(os.path.join(root(), "registry.json"), {"agents": []})
    agents = doc.get("agents") if isinstance(doc, dict) else None
    return agents if isinstance(agents, list) else []


def register(aid, role="mate"):
    """Pin a roster slot. Idempotent."""
    ensure()
    path = os.path.join(root(), "registry.json")
    doc = _read_json(path, {"agents": []})
    agents = doc.get("agents") if isinstance(doc, dict) else None
    if not isinstance(agents, list):
        agents = []
    for a in agents:
        if a.get("id") == aid:
            a["role"] = role
            a["status"] = "idle"
            break
    else:
        agents.append({"id": aid, "role": role, "status": "idle"})
    _write_json(path, {"agents": agents})
    base = agent_dir(aid)
    os.makedirs(os.path.join(base, "inbox", ".done"), exist_ok=True)
    os.makedirs(os.path.join(base, "outbox"), exist_ok=True)
    ident = os.path.join(base, "identity.md")
    if not os.path.isfile(ident):
        _write_text(ident, "# %s\nrole: %s\n" % (aid, role))
    mem = os.path.join(base, "memory.md")
    if not os.path.isfile(mem):
        _write_text(mem, "# %s memory\n" % aid)
    if not os.path.isfile(os.path.join(base, "cursor.json")):
        _write_json(os.path.join(base, "cursor.json"), {"last": None})
    return aid


def recall(aid):
    """A mate's long-term memory (markdown, may be empty)."""
    try:
        with open(os.path.join(agent_dir(aid), "memory.md"),
                  encoding="utf-8") as f:
            return f.read()[:2000]
    except OSError:
        return ""


def remember(aid, line):
    """Append one dated line to a mate's memory. Never throws."""
    try:
        register(aid)
        with open(os.path.join(agent_dir(aid), "memory.md"), "a",
                  encoding="utf-8") as f:
            f.write("- %s — %s\n" % (time.strftime("%Y-%m-%d"),
                                     str(line)[:300].replace("\n", " ")))
    except OSError:
        pass


def _find_msg(mid):
    """Locate a message by id across boxes (for reply hop counts)."""
    ensure()
    for aid in [d for d in os.listdir(os.path.join(root(), "agents"))
                if os.path.isdir(agent_dir(d))]:
        for box in ("inbox", "outbox"):
            d = os.path.join(agent_dir(aid), box)
            try:
                names = os.listdir(d)
            except OSError:
                continue
            for n in names:
                if not n.endswith(".json"):
                    continue
                m = _read_json(os.path.join(d, n), {})
                if isinstance(m, dict) and m.get("id") == mid:
                    return m
    return None


def send_msg(from_aid, to_aid, act, subject, body="", conv="",
             in_reply_to=None):
    """Drop a FIPA-lite message in the sender's outbox. Returns the row."""
    if act not in ACTS:
        raise ValueError("act must be one of %s" % ("/".join(ACTS),))
    ensure()
    hops, parent = 0, None
    if in_reply_to:
        parent = _find_msg(in_reply_to)
        if parent:
            hops = int(parent.get("hops") or 0) + 1
    needs_human, to = False, str(to_aid)[:40]
    if hops > HOP_CAP:
        # escalate instead of ping-ponging forever.
        needs_human, to = True, "nicki"
        subject = "[escalated after %d hops] %s" % (hops, subject)
    register(from_aid)  # writers must exist; recipients come from the roster.
    row = {"id": _new_id(), "conversation": str(conv or "lobby")[:60],
           "in_reply_to": in_reply_to, "from": str(from_aid)[:40],
           "to": to, "act": act, "subject": str(subject)[:200],
           "body": str(body)[:2000], "hops": hops,
           "requires_reply": act in OBLIGATED, "needs_human": needs_human,
           "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    _write_json(os.path.join(agent_dir(from_aid), "outbox",
                             row["id"] + ".json"), row)
    append_log("msg", id=row["id"], conv=row["conversation"],
               frm=row["from"], to=to, act=act)
    return row


def drain():
    """Router: move every outbox file to its recipient's inbox.
    Unknown recipients go to nicki (the god proxy). Returns delivered n."""
    ensure()
    delivered = 0
    agents = os.path.join(root(), "agents")
    try:
        aids = [d for d in os.listdir(agents) if os.path.isdir(
            os.path.join(agents, d))]
    except OSError:
        return 0
    known = set(aids) | {"nicki", "broadcast"}
    for aid in aids:
        box = os.path.join(agents, aid, "outbox")
        try:
            names = sorted(os.listdir(box))
        except OSError:
            continue
        for n in names:
            if not n.endswith(".json"):
                continue
            src = os.path.join(box, n)
            row = _read_json(src, {})
            if not isinstance(row, dict) or not row.get("id"):
                try:
                    os.remove(src)
                except OSError:
                    pass
                continue
            dest_aid = row.get("to") if row.get("to") in known else "nicki"
            if dest_aid == "broadcast":
                for other in aids:
                    if other != aid:
                        register(other)
                        _write_json(os.path.join(agent_dir(other), "inbox",
                                                 n), row)
                        delivered += 1
            else:
                register(dest_aid)
                _write_json(os.path.join(agent_dir(dest_aid), "inbox", n),
                            row)
                delivered += 1
            try:
                os.remove(src)
            except OSError:
                pass
            append_log("deliver", id=row.get("id"), to=dest_aid)
    return delivered


def unread(aid):
    """Delivered-but-unacked inbox messages, oldest first."""
    ensure()
    register(aid)
    cur = _read_json(os.path.join(agent_dir(aid), "cursor.json"),
                     {"last": None})
    last = cur.get("last") if isinstance(cur, dict) else None
    try:
        names = sorted(os.listdir(os.path.join(agent_dir(aid), "inbox")))
    except OSError:
        return []
    out = []
    for n in names:
        if not n.endswith(".json"):
            continue
        row = _read_json(os.path.join(agent_dir(aid), "inbox", n), {})
        if isinstance(row, dict) and row.get("id"):
            out.append(row)
    out.sort(key=lambda m: m.get("id", ""))
    if last:
        out = [m for m in out if m.get("id", "") > last]
    return out


def ack(aid, mid):
    """File one message as processed (kept for audit, never deleted)."""
    ensure()
    register(aid)
    base = agent_dir(aid)
    src = os.path.join(base, "inbox", mid + ".json")
    row = _read_json(src, None)
    if not isinstance(row, dict):
        return False
    _write_json(os.path.join(base, "inbox", ".done", mid + ".json"), row)
    try:
        os.remove(src)
    except OSError:
        pass
    _write_json(os.path.join(base, "cursor.json"), {"last": mid})
    return True


def recall_fts(query, n=5):
    """FTS5 over memory.md + log; substring fallback. Never raises."""
    q = str(query or "").strip()
    if not q:
        return []
    try:
        texts = []
        try:
            for row in read_log(limit=400):
                texts.append(" ".join(str(v) for v in row.values()
                                      if isinstance(v, str))[:500])
        except Exception:
            pass
        try:
            base = os.path.join(root(), "agents")
            for aid in os.listdir(base):
                try:
                    with open(os.path.join(base, aid, "memory.md"),
                              encoding="utf-8") as f:
                        for ln in f.read().splitlines():
                            if ln.strip():
                                texts.append(ln[:500])
                except OSError:
                    continue
        except OSError:
            pass
        if not texts:
            return []
        try:
            import sqlite3
            con = sqlite3.connect(":memory:")
            con.execute("CREATE VIRTUAL TABLE f USING fts5(body)")
            con.executemany("INSERT INTO f(body) VALUES (?)",
                            [(t,) for t in texts[-500:]])
            rows = [r[0] for r in con.execute(
                "SELECT body FROM f WHERE f MATCH ? LIMIT ?",
                (q, max(1, n))).fetchall()]
            con.close()
            if rows:
                return rows[:max(1, n)]
            raise ValueError("no fts hits")
        except Exception:
            ql = q.lower()
            hits = [t for t in texts if ql in t.lower()]
            return hits[-max(1, n):][::-1] if hits else []
    except Exception:
        return []


def reflect():
    """Log exceeds 400 lines: fold oldest third into nicki memory (local,
    no model call) and truncate. Returns True when folded. Never raises."""
    try:
        ensure()
        p = os.path.join(root(), "log.jsonl")
        try:
            with open(p, encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            return False
        if len(lines) <= 400:
            return False
        k = len(lines) // 3
        old, rest = lines[:k], lines[k:]
        for ln in old:
            try:
                row = json.loads(ln)
                s = " ".join(str(v) for v in row.values()
                             if isinstance(v, str))[:200].replace("\n", " ")
            except ValueError:
                s = ln.strip()[:200]
            if s.strip():
                remember("nicki", s)
        try:
            with open(p, "w", encoding="utf-8") as f:
                f.writelines(rest)
        except OSError:
            return False
        return True
    except Exception:
        return False


def god_brief(max_chars=1200):
    """Nicki's standing context: roster + open tasks + her inbox +
    the escalation policy. Prompt, not code, is the control surface."""
    ensure()
    lines = ["[floor — you are Nicki, orchestrator. You go by Nicki; "
             "never introduce yourself as a model or engine name. "
             "Routine: answer or "
             "route it yourself. Critical (destructive, spend, scope "
             "change, conflict): ask the human first.]",
             "[style (ADHD): short plain text, no diagrams unless the human "
             "asks for one. Long text only for plans/research.]"]
    team = ", ".join("%s·%s" % (a.get("id"), a.get("role"))
                     for a in roster()[:8])
    if team:
        lines.append("crew: %s" % team)
    open_tasks = [t for t in list_tasks()
                  if t.get("status") in TASK_OPEN][:6]
    for t in open_tasks:
        lines.append("task %s [%s] %s: %s" % (
            t.get("id", "?")[-6:], t.get("status"),
            t.get("assignee"), t.get("title")))
    for m in unread("nicki")[:3]:
        lines.append("inbox %s→: %s" % (m.get("from"), m.get("subject")))
    # mates file self-text reports (done/inform) on every crew run — the
    # newest body rides the next turn so continuity never needs re-asking.
    try:
        box = unread("nicki")
        if box:
            last = box[-1]
            body = str(last.get("body") or "").strip().replace("\n", " ")
            if body:
                lines.append("lastwords %s: %s" % (last.get("from"), body[:160]))
    except Exception:
        pass
    return "\n".join(lines)[:max_chars]
