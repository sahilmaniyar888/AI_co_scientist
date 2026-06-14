"""
Record a real pipeline run for a demo and save it as a replayable snapshot.

Usage:
    python -m api.pipeline.precompute liver_fibrosis
    python -m api.pipeline.precompute all
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from api.pipeline import db, demos, k2, orchestrator, snapshot  # noqa: E402
from api.pipeline.bus import EventBus  # noqa: E402

# Modest scope keeps the one-time recording reliable while still rich.
MAX_HYP = 10
ROUNDS = 2


def _audit_snapshot(snap: dict) -> list[str]:
    """Detect a degenerate recording caused by mid-run K2 failures.

    When the K2 API drops out partway through a recording, the pipeline's
    try/except fallbacks fill in placeholders ("Score unavailable.",
    "Defaulted (judge parse error).", empty protocols). The run still
    "completes" and would silently overwrite a good snapshot. This audit
    returns a list of fatal problems so the caller can refuse to save.
    """
    db_ = snap["db"]
    problems: list[str] = []

    scores = db_.get("scores", {}) or {}
    score_rows = list(scores.values()) if isinstance(scores, dict) else list(scores)
    if not score_rows:
        problems.append("no scored hypotheses")
    else:
        dead = sum(
            1 for s in score_rows
            if "Score unavailable" in json.dumps(s.get("rationale", ""))
        )
        if dead > len(score_rows) // 2:
            problems.append(
                f"{dead}/{len(score_rows)} scores are placeholders (K2 scoring failed)"
            )

    debates = db_.get("debates", []) or []
    deb_rows = list(debates.values()) if isinstance(debates, dict) else list(debates)
    if deb_rows:
        dead_deb = sum(1 for d in deb_rows if not (d.get("a_argument") or "").strip())
        if dead_deb > len(deb_rows) // 2:
            problems.append(
                f"{dead_deb}/{len(deb_rows)} debates are defaulted (K2 judge failed)"
            )

    enrichment = db_.get("enrichment", {}) or {}
    enr_rows = list(enrichment.values()) if isinstance(enrichment, dict) else list(enrichment)
    if enr_rows:
        empty = sum(1 for e in enr_rows if not (e.get("protocol") or {}))
        if empty == len(enr_rows):
            problems.append("all enrichment protocols are empty (K2 protocol agent failed)")

    novelty = db_.get("novelty", {}) or {}
    nov_rows = list(novelty.values()) if isinstance(novelty, dict) else list(novelty)
    if not nov_rows:
        problems.append("no grounded novelty results (prior-art stage produced nothing)")
    else:
        empty_nv = sum(1 for n in nov_rows if not (n.get("novelty") or {}))
        if empty_nv == len(nov_rows):
            problems.append("all novelty checks are empty (K2 novelty verifier failed)")

    return problems


async def record(demo_id: str) -> None:
    demo = demos.DEMO_BY_ID[demo_id]
    run_id = f"src_{demo_id}"
    config = {
        "title": demo["title"], "domain": demo["domain"], "source": demo["source"],
        "search_queries": demo["search_queries"],
        "max_hypotheses": MAX_HYP, "debate_rounds": ROUNDS,
    }
    bus = EventBus()
    t0 = time.time()

    async def watch():
        q = bus.subscribe()
        while True:
            item = await q.get()
            if item is None:
                break
            ev = item["event"]
            if ev in ("stage", "papers_loaded", "gaps_done", "contradictions_done",
                      "round_done", "run_complete", "run_error"):
                print(f"  [{time.time()-t0:6.1f}s] {ev:18} {str(item['data'])[:60]}", flush=True)

    w = asyncio.create_task(watch())
    await db.clear_run(run_id)
    await db.create_run(run_id, demo["goal"], config, demo_id)
    await orchestrator._run(run_id, demo["goal"], config, bus, demo_id)
    await bus.close()
    await w

    snap = await snapshot.export_run(run_id, bus.history)
    n_ev = len(bus.history)
    n_hyp = len(snap["db"]["hypotheses"])
    n_deb = len(snap["db"]["debates"])
    summary = (f"{time.time()-t0:.0f}s | {n_ev} events | {n_hyp} hyps | "
               f"{n_deb} debates | {len(snap['db']['scores'])} scored")

    problems = _audit_snapshot(snap)
    if problems:
        print(f"  REJECTED {demo_id}: {summary}", flush=True)
        for p in problems:
            print(f"    - {p}", flush=True)
        print("    -> existing snapshot left untouched; re-run when K2 is healthy.",
              flush=True)
        raise RuntimeError(f"degenerate recording for {demo_id}: {'; '.join(problems)}")

    snapshot.save_snapshot(demo_id, snap)
    print(f"  SAVED {demo_id}: {summary}", flush=True)


async def main() -> None:
    await db.init_db()
    target = sys.argv[1] if len(sys.argv) > 1 else "liver_fibrosis"
    ids = [d["id"] for d in demos.DEMOS] if target == "all" else [target]
    for did in ids:
        print(f"=== precompute {did} ===", flush=True)
        try:
            await record(did)
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED {did}: {exc}", flush=True)
    await k2.aclose()


if __name__ == "__main__":
    asyncio.run(main())
