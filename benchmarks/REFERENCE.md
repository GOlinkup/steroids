# Reference environment (P0-1, frozen 2026-09-23)

Any future run reproducing today's index numbers must match these values.
Re-verify with the commands at the bottom; any mismatch voids comparability.

- index size: 1265 (`python3 src/steroids/router.py --count`)
- skill-rules sha256: 7ec77dcd2d37055df7f918284abc8fe2a0fc8e473af93de68fe055e9c0c55275
- embed model: Xenova/all-MiniLM-L6-v2:quantized (ONNX int8, offline)
- onnxruntime: 1.30.0 / python: 3.14.7
- vectors digest: ca6838b4911633f23b87c52aa92730cf8c85f285 (1265 vecs)
- commit: 53a29691b5dd81d7782096e3d0a227c374dabe06

Note (evidence for why this file exists): the vectors digest rotated
3295c6df → ca6838b4 during this session's benchmark runs (live skill files
drift under us). Numbers without a frozen reference are not comparable.

Re-verify:
  python3 src/steroids/router.py --count
  sha256sum skill-rules.json
  python3 -c "import json;d=json.load(open('$HOME/.cache/steroids/embed/vectors.json'));print(d['digest'],len(d['vecs']))"
  git rev-parse HEAD
