# Steroids visual-check set (ex-steroids-arch-visuals)

Re-runnable checks for the demo graph + export + eval lanes.
All values verified live 2026-09-20; re-run any line to confirm.

## 1. Graph data parses with expected shape

```bash
python3 -c "import json;d=json.load(open('demo/skill-graph.json'));print(len(d['nodes']),len(d['links']),sorted(d.keys()))"
# expect: live count, e.g. 1265 2866 ['links', 'meta', 'nodes'] — compare against `steroids --count`
```

## 2. Fresh export matches shipped data (deterministic)

```bash
python3 src/steroids/graph_export.py /tmp/vc-graph.json   # expect: live nodes/links matching `steroids --count`
python3 -c "import json;a=json.load(open('demo/skill-graph.json'));b=json.load(open('/tmp/vc-graph.json'));print(sorted(n['id'] for n in a['nodes'])==sorted(n['id'] for n in b['nodes']))"
# expect: True
```

## 3. Demo JS parses clean (behavior frozen)

```bash
python3 -c "import re;h=open('demo/skill-graph.html').read();open('/tmp/vc-js.js','w').write(h.split('<script>')[1].split('</script>')[0])" && node --check /tmp/vc-js.js
# expect: no output (clean)
```

## 4. Required element ids present

`search`, `canvas`, `details`, `headline` — search filters
(`match()` dims non-hits), click selects node into details, drag/pan/zoom
on canvas. Offline open renders the 12-node SAMPLE fallback; headline shows
live count once `skill-graph.json` loads via fetch.

## 5. Unit suites green (no pytest on box — stdlib runner)

```bash
python3 tests/test_router.py   # expect: Ran 3 tests, OK
python3 tests/test_eval.py     # expect: Ran 3 tests, OK (12-row golden)
```

## 6. Eval baselines (other lanes — cited, not owned)

- `tests/blind_eval_100.py`: 100+ paraphrase/synonym/typo rows, P@1/P@3/leaks.
- `tests/live_probe.py`: 16 blind queries vs live index (see `steroids --count`).
- Pre-rules baseline (eval-live lane): P@1 0.875 / P@3 0.625 / leaks 6.
  Post-rules-apply numbers belong to that card when it lands.
