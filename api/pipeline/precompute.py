"""
Record a real pipeline run for a demo and save it as a replayable snapshot.

Usage:
    python -m api.pipeline.precompute liver_fibrosis
    python -m api.pipeline.precompute all
"""

from __future__ import annotations

import asyncio
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
    snapshot.save_snapshot(demo_id, snap)
    n_ev = len(bus.history)
    n_hyp = len(snap["db"]["hypotheses"])
    n_deb = len(snap["db"]["debates"])
    print(f"  SAVED {demo_id}: {time.time()-t0:.0f}s | {n_ev} events | "
          f"{n_hyp} hyps | {n_deb} debates | "
          f"{len(snap['db']['scores'])} scored", flush=True)


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
