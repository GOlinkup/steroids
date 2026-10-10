"""Loop tests (stub executor, monkeypatched routing — no LLM, no network).

Covers: done, heal-recovered, heal-exhausted, abstain-propose,
artifact-required, artifact-present. Plain asserts (repo has no pytest).
"""
import os
import sys

sys.path.insert(0, "/home/TWIG/steroids/island")
sys.path.insert(0, "/home/TWIG/steroids/src")
import loop  # noqa: E402

N = [0]


def _journal():
    N[0] += 1
    return f"/tmp/loop-test-{N[0]}.db"


def _ok_stub(prompt, box_dir, provider="opencode"):
    with open(os.path.join(box_dir, "receipt.txt"), "w") as fh:
        fh.write("evidence")
    return {"ok": True, "output": "did the thing"}


def test_done_path():
    loop._route = lambda prompt, ranker="v1": {"skills": ["git-commit-helper"]}
    out = loop.run_loop("write a git commit message", execute=_ok_stub,
                        journal_path=_journal())
    assert out["verdict"] == "done", out
    assert out["steps"][-1]["status"] == "done"


def test_heal_recovered():
    calls = []

    def flaky(prompt, box_dir, provider="opencode"):
        calls.append(prompt)
        if len(calls) == 1:
            return {"ok": False, "error": "boom"}
        return {"ok": True, "output": "recovered work"}

    def route(prompt, ranker="v1"):
        return {"skills": ["other-skill"]} if ranker == "v2" else {"skills": ["first-skill"]}
    loop._route = route
    out = loop.run_loop("do the thing", execute=flaky, journal_path=_journal())
    assert out["verdict"] == "done", out
    assert out["steps"][-1]["status"] == "recovered", out["steps"]


def test_heal_exhausted_escalates():
    loop._route = lambda prompt, ranker="v1": {"skills": ["s1"]}
    out = loop.run_loop("do the thing",
                        execute=lambda p, b, provider="opencode": {"ok": False, "error": "always"},
                        journal_path=_journal())
    assert out["verdict"] == "needs_user", out


def test_abstain_proposes():
    loop._route = lambda prompt, ranker="v1": {}
    loop._propose = lambda: [{"suggested_name": "x-y"}]
    out = loop.run_loop("qzxw vbnm", execute=_ok_stub, journal_path=_journal())
    assert out["verdict"] == "blocked-needs-skill", out
    assert out["steps"][-1]["result"]["drafts"][0]["suggested_name"] == "x-y"


def test_missing_named_file_fails():
    loop._route = lambda prompt, ranker="v1": {"skills": ["s1"]}
    out = loop.run_loop("create a file hello.txt with hello",
                        execute=lambda p, b, provider="opencode": {"ok": True, "output": "claims done"},
                        journal_path=_journal())
    assert out["verdict"] == "needs_user", out
    assert "hello.txt" in out["steps"][-1]["result"]["reason"], out["steps"]


def test_present_named_file_passes():
    loop._route = lambda prompt, ranker="v1": {"skills": ["s1"]}

    def file_stub(prompt, box_dir, provider="opencode"):
        with open(os.path.join(box_dir, "hello.txt"), "w") as fh:
            fh.write("hello world")
        return {"ok": True, "output": "wrote it"}

    out = loop.run_loop("create a file hello.txt with hello",
                        execute=file_stub, journal_path=_journal())
    assert out["verdict"] == "done", out


def test_crew_parallel_sessions():
    seen = {}

    def crew_stub(prompt, box_dir, provider="opencode"):
        seen[prompt[:24]] = box_dir
        return {"ok": True, "output": "lane done"}

    loop._route = lambda prompt, ranker="v1": {"skills": ["s1", "s2"]}
    out = loop.run_loop("do two things", execute=crew_stub,
                        journal_path=_journal(), crew=True)
    assert out["verdict"] == "done", out
    assert len(out["crew"]) == 2, out["crew"]
    sessions = [c["session"] for c in out["crew"]]
    assert len(set(sessions)) == 2, "mates must own distinct sessions"
    assert all(s.startswith("loop-") for s in sessions)
    roles = [c["role"] for c in out["crew"]]
    assert len(set(roles)) == 2, "mates must own distinct lanes"
    assert len(seen) == 2, "each mate ran in its own box"
    assert "lead" in roles[0] or "lead" in roles or "scout" in roles


def test_drain_followup_bounded():
    import tempfile
    import hive
    old = os.environ.get("STEROIDS_HOME")
    os.environ["STEROIDS_HOME"] = tempfile.mkdtemp(prefix="steroids-drain-")
    try:
        hive.register("coder", "coder")
        hive.register("nicki", "orchestrator")
        box = tempfile.mkdtemp(prefix="steroids-box-")
        calls = []

        def needy(prompt, box_dir, provider="opencode"):
            calls.append(prompt)
            import time as _t
            # ids are second-resolution: sleep so the new row sorts after
            # the ack cursor (same trick as real mates filing next-second).
            _t.sleep(1.1)
            # every round files one more request: self-perpetuating inbox.
            hive.send_msg("nicki", "coder", "request", "more %d" % len(calls),
                          "please do %d" % len(calls))
            hive.drain()
            return {"ok": True, "output": "round %d" % len(calls)}

        hive.send_msg("nicki", "coder", "request", "more 0", "please do 0")
        hive.drain()
        rounds = loop._drain_followups("coder", needy, box, "opencode")
        assert rounds == 2, rounds  # bounded at 2, never loops forever.
        left = [m for m in hive.unread("coder")
                if m.get("act") in ("request", "propose")]
        assert left == [], left  # leftovers parked as ledger rows.
        parked = [t for t in hive.list_tasks() if t["title"].startswith("parked")]
        assert parked, "leftovers must park as tasks"
    finally:
        if old is not None:
            os.environ["STEROIDS_HOME"] = old
        else:
            os.environ.pop("STEROIDS_HOME", None)


if __name__ == "__main__":
    # Direct-runner (CI pattern is `python3 tests/test_X.py`; repo has no
    # pytest): call every test_* function, report, exit non-zero on failure.
    # Without this the file exits 0 running nothing — a dishonest green.
    names = sorted(n for n in globals() if n.startswith("test_") and callable(globals()[n]))
    failed = 0
    for name in names:
        try:
            globals()[name]()
        except Exception as exc:
            failed += 1
            print(f"FAIL {name}: {exc}")
        else:
            print(f"ok {name}")
    print(f"{len(names) - failed}/{len(names)} passed")
    sys.exit(1 if failed else 0)
