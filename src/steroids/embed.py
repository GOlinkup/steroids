#!/usr/bin/env python3
"""Steroids embedding backend: offline-first ONNX semantic vectors.

Model: Xenova/all-MiniLM-L6-v2 (int8 quantized, ~23MB), fetched ONCE into
~/.cache/steroids/embed/ then air-gapped. No network access from this module,
ever: if the model files are absent (or onnxruntime is not installed) every
public function degrades to None/{} and the router stays purely lexical.

Only new dependency: onnxruntime (numpy rides along as its dependency).
Tokenizer is hand-rolled stdlib WordPiece (~40 lines) over vocab.txt.
"""
import hashlib
import json
import math
import os
import re

MODEL_ID = "Xenova/all-MiniLM-L6-v2:quantized"
EMBED_DIR = os.path.join(os.path.expanduser("~"), ".cache", "steroids", "embed")
MODEL_PATH = os.path.join(EMBED_DIR, "model_quantized.onnx")
VOCAB_PATH = os.path.join(EMBED_DIR, "vocab.txt")
VEC_CACHE_PATH = os.path.join(EMBED_DIR, "vectors.json")
MAX_TOKENS = 128

_session = None
_vocab = None
_tried = False
_vec_mem = {}


def available():
    """True iff onnxruntime imports AND both model files exist on disk."""
    global _session, _vocab, _tried
    if _session is not None:
        return True
    if _tried:
        return False
    _tried = True
    try:
        if not (os.path.isfile(MODEL_PATH) and os.path.isfile(VOCAB_PATH)):
            return False
        import onnxruntime as ort
        _session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        with open(VOCAB_PATH, encoding="utf-8") as f:
            words = [ln.rstrip("\n") for ln in f]
        _vocab = ({w: i for i, w in enumerate(words)}, words)
    except Exception:
        _session = None
        return False
    return True


def wordpiece(text):
    """Stdlib WordPiece (uncased) using the model's vocab.txt."""
    vocab, _ = _vocab
    unk = vocab.get("[UNK]")
    out = []
    for w in re.findall(r"[a-z0-9]+|[^a-z0-9\s]", text.lower()):
        if w in vocab:
            out.append(vocab[w])
            continue
        start, sub = 0, []
        chars = list(w)
        while start < len(chars):
            end, cur = len(chars), None
            while end > start:
                piece = ("##" if start else "") + "".join(chars[start:end])
                if piece in vocab:
                    cur = piece
                    break
                end -= 1
            if cur is None:
                sub = None
                break
            sub.append(vocab[cur])
            start = end
        if sub is None:
            out.append(unk)
        else:
            out.extend(sub)
        if len(out) > MAX_TOKENS:
            break
    return out[:MAX_TOKENS]


def _run_batch(id_batch):
    """One ONNX call for a batch of id-lists -> mean-pooled raw vectors."""
    import numpy as np
    n = len(id_batch)
    width = max(len(r) for r in id_batch)
    ids = np.zeros((n, width), dtype=np.int64)
    mask = np.zeros((n, width), dtype=np.int64)
    for i, row in enumerate(id_batch):
        ids[i, :len(row)] = row
        mask[i, :len(row)] = 1
    names = [inp.name for inp in _session.get_inputs()]
    feed = {names[0]: ids}
    if len(names) > 1:
        feed[names[1]] = mask
    if len(names) > 2:
        feed[names[2]] = np.zeros_like(ids)
    last = _session.run(None, feed)[0]
    m = mask.astype(np.float32)
    summed = (last * m[:, :, None]).sum(axis=1)
    return (summed / m.sum(axis=1, keepdims=True)).tolist()


def _norm(vec):
    n = math.sqrt(sum(x * x for x in vec)) or 1e-12
    return [x / n for x in vec]


def embed_texts(texts):
    """Batched embed -> L2-normalized vectors. Empty list in, empty out."""
    if not available() or not texts:
        return []
    cls, sep = _vocab[0]["[CLS]"], _vocab[0]["[SEP]"]
    batches, out = [texts[i:i + 32] for i in range(0, len(texts), 32)], []
    for batch in batches:
        rows = [[cls] + wordpiece(t) + [sep] for t in batch]
        out.extend(_norm(v) for v in _run_batch(rows))
    return out


def skill_doc(name, keys):
    """Deterministic doc text per skill: always in sync with the live index."""
    return name.replace("-", " ").replace("_", " ") + " " + " ".join(keys)


def build_docs(rules, idx, describe):
    """Rich doc per skill: name + SKILL.md description + keywords.

    `describe` maps skill -> description ('' when unavailable); entries fall
    back to skill_doc so behavior never depends on file access succeeding.
    """
    docs = {}
    for skill, keys in idx.items():
        desc = (describe or {}).get(skill, "")
        if desc:
            docs[skill] = skill_doc(skill, keys) + " " + desc[:800]
        else:
            docs[skill] = skill_doc(skill, keys)
    return docs


def get_vectors(idx, docs=None):
    """{skill: vec} for this index object; disk-cached by content hash.

    Returns {} when the backend is unavailable (router falls back to lexical).
    """
    if not available():
        return {}
    key = id(idx)
    hit = _vec_mem.get(key)
    names = sorted(idx)
    if docs is None:
        docs = {s: skill_doc(s, idx[s]) for s in names}
    texts = [docs[s] for s in names]
    digest = hashlib.sha1((MODEL_ID + "\n" + "\n".join(texts)).encode()).hexdigest()
    if hit is not None and hit[0] == digest:
        return hit[1]
    try:
        with open(VEC_CACHE_PATH, encoding="utf-8") as f:
            disk = json.load(f)
    except Exception:
        disk = {}
    if disk.get("digest") == digest and set(disk.get("vecs", {})) == set(names):
        vecs = disk["vecs"]
    else:
        vecs = dict(zip(names, embed_texts(texts)))
        try:
            os.makedirs(EMBED_DIR, exist_ok=True)
            with open(VEC_CACHE_PATH, "w", encoding="utf-8") as f:
                json.dump({"digest": digest, "vecs": vecs}, f)
        except OSError:
            pass
    _vec_mem.clear()
    _vec_mem[key] = (digest, vecs)
    return vecs


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))
