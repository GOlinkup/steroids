#!/usr/bin/env python3
"""Team loop: one command -> routed skills -> planned steps -> executed
turns -> verified result. Self-heals once per step (re-route with the
challenger ranker, retry on a changed pick) and proposes a skill draft
when nothing fits. Every step is journaled (durable.py) so a crash
resumes instead of redoing. Stdlib only.

Reuses router.py (--json/--propose/--ranker), agentlog.describe_command
(same CLI invocation as bridge /chat), dots LocalBoxes (filesystem
isolation per step). Never claims success without evidence: a step is
done only with returncode 0 + non-empty output + an independent verify
pass over its receipt.
"""
import json
import os
import re
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agentlog  # noqa: E402  (same CLI path as bridge.py)
import hive  # noqa: E402  (team floor: ledger + inbox)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTER = os.path.join(REPO_ROOT, "src", "steroids", "router.py")
sys.path.insert(0, os.path.join(REPO_ROOT, "src"))
from steroids import durable  # noqa: E402  (crash-safe journal)
from steroids.dots import sandboxes  # noqa: E402

STEP_TIMEOUT = 300
# ponytail: 4 parallel steps max; wider fan-out needs dependency tracking.
MAX_STEPS = 4
# Failed boxes stay for forensics, but never forever: sweep older than this.
BOX_KEEP_SECONDS = 24 * 3600


def _sweep_boxes(boxes):
    """Delete loop boxes older than BOX_KEEP_SECONDS. Best-effort."""
    import glob
    now = time.time()
    for d in glob.glob(os.path.join(boxes.root, "local-*")):
        try:
            if now - os.path.getmtime(d) > BOX_KEEP_SECONDS:
                boxes.delete_box(os.path.basename(d))
        except OSError:
            pass


def _route(prompt, ranker="v1"):
    argv = [sys.executable, ROUTER, "--json", "--ranker", ranker, prompt]
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=60)
        return json.loads(proc.stdout or "{}")
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError):
        return {}


def _propose():
    try:
        proc = subprocess.run([sys.executable, ROUTER, "--propose"],
                              capture_output=True, text=True, timeout=60)
        out = json.loads(proc.stdout or "[]")
        return out if isinstance(out, list) else []
    except (subprocess.TimeoutExpired, json.JSONDecodeError, ValueError):
        return []


# Crew roles (same pool as the island team tiles): each mate owns a lane.
ROLE_POOL = ["lead", "scout", "coder", "critic", "scribe", "runner", "sage", "relay"]
ROLE_BRIEF = {
    "lead": "split the goal and own the final merge",
    "scout": "read the terrain first, report what exists",
    "coder": "write the change, small and working — cover the edge cases "
    "unprompted (outside-click closes, empty states, double-taps, "
    "offline), not just the happy path",
    "critic": "list what could go wrong and the checks that catch it",
    "scribe": "write it down so the next mate understands",
    "runner": "run it and report exactly what happened",
    "sage": "answer from the docs, cite them",
    "relay": "carry this result to the next step intact",
}


def _session_event(session, provider, event, text="", ok=True):
    """Honest tile feed: prompt at start, stop at end. No fake tool steps."""
    try:
        agentlog.append_event({"session": session, "ts": time.time(),
                               "agent": provider, "event": event,
                               "text": str(text)[:500], "ok": ok})
    except Exception:
        pass


def _drain_followups(agent, run=None, box_dir=None, provider="opencode",
                     max_rounds=2):
    """Stop-hook drain: after a step, re-check unread(agent); on new
    request/propose run a bounded follow-up (max_rounds), then park
    leftovers as ledger rows so it can never loop forever."""
    rounds = 0
    try:
        if run is None or box_dir is None:  # park-only mode.
            try:
                notes = [m for m in hive.unread(agent)
                         if m.get("act") in ("request", "propose")]
            except Exception:
                return 0
            for m in notes:
                try:
                    hive.add_task("parked: %s" % str(
                        m.get("subject") or m.get("id") or "")[:80],
                        str(m.get("body") or "")[:500], agent, "todo")
                    hive.ack(agent, m.get("id", ""))
                except Exception:
                    pass
            return 0
        for _ in range(max(1, max_rounds)):
            try:
                notes = [m for m in hive.unread(agent)
                         if m.get("act") in ("request", "propose")]
            except Exception:
                break
            if not notes:
                break
            try:
                prompt = str(notes[-1].get("body")
                             or notes[-1].get("subject")
                             or "follow-up")[:500]
                run(prompt, box_dir, provider)
            except Exception:
                pass
            rounds += 1
            for n in notes:
                try:
                    hive.ack(agent, n.get("id", ""))
                except Exception:
                    pass
        try:
            left = [m for m in hive.unread(agent)
                    if m.get("act") in ("request", "propose")]
        except Exception:
            left = []
        for m in left:
            try:
                hive.add_task("parked: %s" % str(
                    m.get("subject") or m.get("id") or "")[:80],
                    str(m.get("body") or "")[:500], agent, "todo")
                hive.ack(agent, m.get("id", ""))
            except Exception:
                pass
    except Exception:
        pass
    return rounds


def _run_mate(step, role, boxes, run, provider, session):
    """One crew mate: own box, own session id, role lane. Worker-safe
    (no journal touch — the main thread logs results). Returns a record."""
    box = boxes.create_box()
    box_dir = boxes._dir(box["id"])
    attempts = 1
    t_step = time.time()
    lane = (f"You are {role} on a crew ({ROLE_BRIEF.get(role, 'own your lane')}). "
            f"Your lane only, no one else's: {step['subtask']}")
    try:  # handed-off notes ride the lane; read once, then filed.
        notes = hive.unread(role)
        if notes:
            bite = "\n".join("[%s] %s: %s" % (
                n.get("from"), n.get("subject"),
                (n.get("body") or "")[:200]) for n in notes[-3:])[:1000]
            if bite:
                lane = "Teammate notes:\n%s\n\n%s" % (bite, lane)
            for n in notes:
                hive.ack(role, n.get("id", ""))
    except Exception:
        pass
    _session_event(session, provider, "UserPromptSubmit", lane)
    before = set(os.listdir(box_dir))
    receipt = run(lane, box_dir, provider)
    receipt["artifacts"] = sorted(set(os.listdir(box_dir)) - before)
    check = _verify({**step, "subtask": lane, "box_dir": box_dir}, receipt)
    if not check["verified"]:
        re = _route(step["subtask"], ranker="v2")
        new_skills = [s for s in (re.get("skills") or []) if s != step["skill"]]
        if new_skills:
            attempts = 2
            lane2 = (f"You are {role} on a crew. Your lane only, no one else's: "
                     f"Using the {new_skills[0]} skill: {step['subtask']}")
            before = set(os.listdir(box_dir))
            receipt = run(lane2, box_dir, provider)
            receipt["artifacts"] = sorted(set(os.listdir(box_dir)) - before)
            check = _verify({**step, "subtask": lane2, "box_dir": box_dir}, receipt)
            if check["verified"]:
                step = {**step, "skill": new_skills[0]}
    _session_event(session, receipt.get("provider", provider), "Stop",
                   f"{role}: {check.get('reason', 'done')}" if not check["verified"]
                   else f"{role}: done", ok=check["verified"])
    try:  # stop-hook drain: follow-ups bounded, leftovers parked.
        _drain_followups(role, run, box_dir, provider)
    except Exception:
        pass
    return {"step": step, "role": role, "session": session, "box_id": box["id"],
            "box_dir": box_dir, "receipt": receipt, "check": check,
            "attempts": attempts, "seconds": round(time.time() - t_step, 1)}


def _execute(step_prompt, box_dir, provider="opencode", model=None):
    """One teammate turn: provider CLI, cwd jailed to the step's box dir.

    Switcher v0: availability fallback — if the requested provider's CLI
    is missing or refuses fast, try the other one and say which ran.
    (Cost/speed routing is future work; availability first.)
    """
    order = [provider] + ([p for p in ("opencode", "claude") if p != provider])
    last_error = ""
    for prov in order:
        try:
            argv, stdin_data = agentlog.describe_command(prov, step_prompt, None, model=model)
        except ValueError as exc:
            last_error = str(exc)
            continue
        try:
            proc = subprocess.run(argv, input=stdin_data, capture_output=True,
                                  text=True, timeout=STEP_TIMEOUT, cwd=box_dir)
        except FileNotFoundError as exc:
            last_error = f"{prov}: {exc}"
            continue
        except subprocess.TimeoutExpired:
            # a hang is not a missing CLI — fail, don't burn 300s more
            return {"ok": False,
                    "error": f"step timed out after {STEP_TIMEOUT}s on {prov}",
                    "provider": prov}
        out = (proc.stdout or "").strip()
        if proc.returncode != 0:
            err = (proc.stderr or out or "non-zero exit")[:500]
            if "not found" in err.lower() or "command not" in err.lower():
                last_error = f"{prov}: {err}"
                continue  # CLI broken — try the other provider
            return {"ok": False, "error": err, "provider": prov}
        if not out:
            return {"ok": False, "error": "empty output — no evidence of work",
                    "provider": prov}
        return {"ok": True, "output": out, "provider": prov}
    return {"ok": False, "error": last_error or "no provider available"}


def _verify(step, receipt):
    """Independent verify pass: re-checks the receipt, never the claim."""
    if not receipt.get("ok"):
        return {"verified": False, "reason": receipt.get("error", "no receipt")}
    if not receipt.get("output"):
        return {"verified": False, "reason": "empty receipt"}
    # File tasks must produce the file: "create/write/make X.ext" names a
    # deliverable, and a step without it is not done no matter the output.
    named = re.findall(r"(?:create|write|make|generate|save)\b.*?(\S+\.\w{1,5})",
                       step.get("subtask", ""), re.IGNORECASE)
    if named:
        made = set(receipt.get("artifacts") or ())
        missing = [f for f in named if os.path.basename(f) not in made]
        if missing:
            # grace re-list: slow agents flush files just after exiting.
            time.sleep(5)
            try:
                made |= set(os.listdir(step.get("box_dir", "")))
            except OSError:
                pass
            missing = [f for f in named if os.path.basename(f) not in made]
        if missing:
            return {"verified": False,
                    "reason": f"named file not produced: {missing[0]}"}
    return {"verified": True, "chars": len(receipt["output"])}


def run_loop(prompt, provider="opencode", emit=None, journal_path="", execute=None,
             cancel=None, crew=None):
    """Run one command end to end. Returns a JSON-able result dict.

    execute(step_prompt, box_dir, provider) is injectable: default runs a
    real agent turn; stress runs pass a fast local stub (labeled as such).
    cancel() is polled between steps: truthy stops the loop with a
    `cancelled` verdict (a running step finishes first — subprocess turns
    are not killed mid-flight).
    """
    t0 = time.time()
    run = execute or _execute
    journal_path = journal_path or os.path.expanduser("~/.config/steroids/loop-journal.db")
    os.makedirs(os.path.dirname(journal_path), exist_ok=True)
    db = durable.open_journal(journal_path)
    steps = []

    def log(name, status, result):
        durable.record_step(db, name, status, result)
        steps.append({"name": name, "status": status, "result": result})
        if emit:
            emit(name, status, result)

    def cancelled():
        try:
            return bool(cancel and cancel())
        except Exception:
            return False

    routed = _route(prompt)
    skills = routed.get("skills") or []
    if not skills:  # nothing fits -> propose a draft, escalate for review
        drafts = _propose()
        log("route", "abstained", {"hint": routed.get("hint", "")[:300]})
        log("propose", "drafted", {"drafts": drafts[:2]})
        return {"ok": False, "verdict": "blocked-needs-skill",
                "detail": "No confident skill. Draft proposed — review before trusting.",
                "steps": steps, "elapsed": round(time.time() - t0, 1)}

    log("route", "done", {"skills": skills[:MAX_STEPS],
                          "hint": (routed.get("hint") or "")[:300]})
    boxes = sandboxes.LocalBoxes()
    _sweep_boxes(boxes)
    plan = [{"skill": s, "subtask": f"Using the {s} skill: {prompt}"}
            for s in skills[:MAX_STEPS]]
    log("plan", "done", {"steps": [p["skill"] for p in plan]})

    if crew:
        # Dunder-Mifflin mode: every mate runs their own session + box in
        # parallel, tiles track them live. Crew runs to completion (sunk
        # turns already spent), verdict by worst step.
        if cancelled():
            log("cancel", "cancelled", {})
            return {"ok": False, "verdict": "cancelled",
                    "detail": "Crew run cancelled before fan-out.",
                    "steps": steps, "elapsed": round(time.time() - t0, 1)}
        import concurrent.futures as _cf
        roles = crew if isinstance(crew, list) else ROLE_POOL[:len(plan)]
        ttag = int(t0 * 1000)
        conv = "loop-%d" % ttag
        try:  # the run lands on the floor board first, mates file after.
            hive.register("nicki", "orchestrator")
            for _rl in roles[:len(plan)]:
                hive.register(_rl, _rl)
            run_row = hive.add_task(prompt[:80] or "crew run", prompt,
                                    "nicki", "running")
        except Exception:
            run_row = None
        with _cf.ThreadPoolExecutor(max_workers=len(plan)) as pool:
            futs = {pool.submit(_run_mate, step, roles[i % len(roles)],
                                boxes, run, provider,
                                f"loop-{ttag}-{roles[i % len(roles)]}"): i
                    for i, step in enumerate(plan)}
            records = sorted(
                (f.result() for f in _cf.as_completed(futs)),
                key=lambda r: r["session"])
        failed = [r for r in records if not r["check"]["verified"]]
        for r in records:
            name = f"step-{r['role']}-{r['step']['skill']}"
            if r["check"]["verified"]:
                status = "recovered" if r["attempts"] > 1 else "done"
                log(name, status, {"skill": r["step"]["skill"], "role": r["role"],
                                   "session": r["session"], "chars": r["check"].get("chars", 0),
                                   "attempts": r["attempts"], "seconds": r["seconds"],
                                   "artifacts": r["receipt"].get("artifacts", [])})
                try:
                    boxes.delete_box(r["box_id"])
                except OSError:
                    pass
            else:
                log(name, "failed", {"skill": r["step"]["skill"], "role": r["role"],
                                     "session": r["session"],
                                     "reason": r["check"]["reason"],
                                     "attempts": r["attempts"], "seconds": r["seconds"]})
            try:  # every mate files its own ledger row.
                res = r["check"].get("reason") or "%d chars in %ss" % (
                    r["check"].get("chars", 0), r["seconds"])
                hive.add_task("crew step %s" % name,
                              r["step"].get("subtask", ""), r["role"],
                              status, result=res)
            except Exception:
                pass
        try:  # mates report to nicki; the run row closes with the verdict.
            for r in records:
                ok = r["check"]["verified"]
                hive.send_msg(r["role"], "nicki",
                              "done" if ok else "inform",
                              "%s: %s" % (r["role"], "done" if ok else
                                          r["check"].get("reason", "failed")),
                              (r["receipt"].get("output")
                               or r["receipt"].get("error") or "")[:500],
                              conv)
            hive.drain()
            if run_row is not None:
                hive.update_task(
                    run_row["id"], status="failed" if failed else "done",
                    result=((failed[0]["check"].get("reason", "failed")
                             if failed else "%d mates done" % len(records)
                             ))[:200])
        except Exception:
            pass
        if failed:
            worst = failed[0]
            return {"ok": False, "verdict": "needs_user",
                    "detail": f"Crew finished: {len(records) - len(failed)}/{len(records)} mates done. "
                              f"{worst['role']} needs you ({worst['check']['reason']}).",
                    "steps": steps, "elapsed": round(time.time() - t0, 1),
                    "crew": [{"role": r["role"], "session": r["session"],
                              "skill": r["step"]["skill"],
                              "verdict": "done" if r["check"]["verified"] else "failed"}
                             for r in records]}
        return {"ok": True, "verdict": "done",
                "detail": f"Crew of {len(records)} finished and verified: " +
                          ", ".join(f"{r['role']} did {r['step']['skill']}" for r in records) + ".",
                "steps": steps, "elapsed": round(time.time() - t0, 1),
                "crew": [{"role": r["role"], "session": r["session"],
                          "skill": r["step"]["skill"], "verdict": "done"}
                         for r in records]}

    for i, step in enumerate(plan):
        if cancelled():
            log("cancel", "cancelled", {})
            return {"ok": False, "verdict": "cancelled",
                    "detail": "Stopped between steps — partial work stays in its boxes.",
                    "steps": steps, "elapsed": round(time.time() - t0, 1)}
        name = f"step-{i}-{step['skill']}"
        box = boxes.create_box()
        box_dir = boxes._dir(box["id"])
        attempts = 1
        t_step = time.time()
        before = set(os.listdir(box_dir))
        receipt = run(step["subtask"], box_dir, provider)
        receipt["artifacts"] = sorted(set(os.listdir(box_dir)) - before)
        check = _verify({**step, "box_dir": box_dir}, receipt)
        try:
            _drain_followups("nicki", run, box_dir, provider)
        except Exception:
            pass
        if check["verified"]:
            log(name, "done", {"skill": step["skill"], "chars": check["chars"],
                               "attempts": attempts,
                               "seconds": round(time.time() - t_step, 1),
                               "artifacts": receipt["artifacts"]})
            try:
                boxes.delete_box(box["id"])  # verified: leave no disk behind
            except OSError:
                pass
            continue
        # self-heal: re-route with the challenger ranker, retry once on change
        re = _route(step["subtask"], ranker="v2")
        new_skills = [s for s in (re.get("skills") or []) if s != step["skill"]]
        if new_skills:
            attempts = 2
            before = set(os.listdir(box_dir))
            receipt = run(f"Using the {new_skills[0]} skill: {prompt}",
                          box_dir, provider)
            receipt["artifacts"] = sorted(set(os.listdir(box_dir)) - before)
            check = _verify({**step, "box_dir": box_dir}, receipt)
            try:
                _drain_followups("nicki", run, box_dir, provider)
            except Exception:
                pass
            if check["verified"]:
                log(name, "recovered", {"skill": new_skills[0], "chars": check["chars"],
                                        "attempts": attempts,
                                        "seconds": round(time.time() - t_step, 1),
                                        "artifacts": receipt["artifacts"]})
                try:
                    boxes.delete_box(box["id"])  # verified: leave no disk behind
                except OSError:
                    pass
                continue
        log(name, "failed", {"skill": step["skill"], "reason": check["reason"],
                             "attempts": attempts,
                             "seconds": round(time.time() - t_step, 1)})
        return {"ok": False, "verdict": "needs_user",
                "detail": f"Step {step['skill']} failed ({check['reason']}) after {attempts} attempt(s).",
                "steps": steps, "elapsed": round(time.time() - t0, 1)}

    return {"ok": True, "verdict": "done",
            "detail": f"{len(plan)} steps executed and verified.",
            "steps": steps, "elapsed": round(time.time() - t0, 1)}


def main():
    args = [a for a in sys.argv[1:] if a not in ("-h", "--help")]
    if not args or set(sys.argv[1:]) & {"-h", "--help"}:
        print("usage: loop.py <plain-english command>  # route>plan>execute>verify")
        return
    print(json.dumps(run_loop(" ".join(args)), indent=1))


if __name__ == "__main__":
    main()
