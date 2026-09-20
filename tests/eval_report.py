#!/usr/bin/env python3
"""Eval report: runnable one-page precision table. Run: python3 tests/eval_report.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_eval import GOLDEN, evaluate, precision_at_k


def main():
    rows = evaluate()
    p1, p3 = precision_at_k(rows, 1), precision_at_k(rows, 3)
    print(f"{'query':<46}{'top-1':<26}{'top-3':<62}P@1  P@3")
    print("-" * 146)
    for query, inc, exc, ranked in rows:
        top3 = "/".join(ranked[:3])
        ok1 = "ok" if ranked[:1] == [inc] else "MISS"
        ok3 = "ok" if (inc in ranked[:3] and not (set(ranked[:3]) & set(exc))) else "MISS"
        print(f"{query[:45]:<46}{(ranked[0] if ranked else '-'):26}{top3[:60]:<62}{ok1:<5}{ok3}")
    print("-" * 146)
    leaks = sum(1 for _, _, exc, ranked in rows if set(ranked[:3]) & set(exc))
    print(f"n={len(rows)}  precision@1={p1:.3f}  precision@3={p3:.3f}  exclusion-leaks={leaks}")


if __name__ == "__main__":
    main()
