"""
Demo snapshot: export a completed run, and replay it under a fresh run_id.

Because each K2-Think call takes 40-100s, a full live pipeline takes many
minutes. For the pre-built demos we record one real run (events + final state)
and replay it: the live view re-streams the *real* recorded reasoning traces
with fast pacing, and every downstream view reads real data. Custom (non-demo)
goals always run live.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from . import db

SNAP_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "demo_runs"


def snapshot_path(demo_id: str) -> Path:
    return SNAP_DIR / f"{demo_id}.json"


def has_snapshot(demo_id: str) -> bool:
    return bool(demo_id) and snapshot_path(demo_id).exists()


async def export_run(run_id: str, events: list[dict]) -> dict:
    """Collect everything needed to replay this run later."""
    run = await db.get_run(run_id)
    return {
        "events": events,
        "db": {
            "meta": run.get("meta", {}) if run else {},
            "domain": run.get("domain", "") if run else "",
            "title": run.get("title", "") if run else "",
            "goal": run.get("goal", "") if run else "",
            "papers": await db.get_papers(run_id),
            "hypotheses": await db.get_hypotheses(run_id),
            "debates": await db.get_debates(run_id),
            "scores": await db.get_scores(run_id),
            "graph": await db.get_graph(run_id),
            "enrichment": await db.get_enrichment(run_id),
            "novelty": await db.get_novelty(run_id),
            "prior_failure": await db.get_prior_failure(run_id),
            "plausibility": await db.get_plausibility(run_id),
        },
    }


def save_snapshot(demo_id: str, snap: dict) -> None:
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_path(demo_id).write_text(
        json.dumps(snap, ensure_ascii=False), encoding="utf-8"
    )


def load_snapshot(demo_id: str) -> dict:
    return json.loads(snapshot_path(demo_id).read_text(encoding="utf-8"))


def _remap_roadmap(roadmap: dict, idmap: dict) -> dict:
    if not isinstance(roadmap, dict):
        return roadmap
    td = roadmap.get("top_discovery")
    if isinstance(td, dict) and td.get("hypothesis_id") in idmap:
        td["hypothesis_id"] = idmap[td["hypothesis_id"]]
    for p in roadmap.get("discovery_portfolio", []) or []:
        if isinstance(p, dict) and p.get("hypothesis_id") in idmap:
            p["hypothesis_id"] = idmap[p["hypothesis_id"]]
    return roadmap


async def _materialize(run_id: str, dbsnap: dict, goal: str, config: dict) -> dict:
    """
    Write the recorded final state into the DB under the new run_id, remapping
    hypothesis ids to fresh unique ones so concurrent/sequential demo replays
    don't collide on the shared snapshot ids. Returns the old->new id map.
    """
    idmap: dict[str, str] = {}
    for h in dbsnap.get("hypotheses", []):
        old = h.get("id")
        if old and old not in idmap:
            idmap[old] = db.nid()

    def rm(x):
        return idmap.get(x, x)

    for p in dbsnap.get("papers", []):
        await db.insert_paper(run_id, p)
    for h in dbsnap.get("hypotheses", []):
        h = dict(h)
        h["id"] = rm(h.get("id"))
        h["parent_ids"] = [rm(pid) for pid in (h.get("parent_ids") or [])]
        await db.insert_hypothesis(run_id, h)
    for d in dbsnap.get("debates", []):
        d = dict(d)
        d["hyp_a_id"] = rm(d.get("hyp_a_id"))
        d["hyp_b_id"] = rm(d.get("hyp_b_id"))
        d["winner_id"] = rm(d.get("winner_id"))
        await db.insert_debate(run_id, d)
    for hid, s in dbsnap.get("scores", {}).items():
        await db.insert_score(run_id, rm(hid), s)
    for hid, e in dbsnap.get("enrichment", {}).items():
        await db.insert_enrichment(run_id, rm(hid), e.get("protocol", {}),
                                   e.get("datasets", {}))
    for hid, nv in dbsnap.get("novelty", {}).items():
        await db.insert_novelty(run_id, rm(hid), nv.get("novelty", {}),
                                nv.get("prior_art", []))
    for hid, pf in dbsnap.get("prior_failure", {}).items():
        await db.insert_prior_failure(run_id, rm(hid), pf.get("failure", {}),
                                      pf.get("trials", []))
    for hid, pl in dbsnap.get("plausibility", {}).items():
        await db.insert_plausibility(run_id, rm(hid), pl)
    await db.save_graph(run_id, dbsnap.get("graph", {}))
    meta = dbsnap.get("meta", {}) or {}
    if meta.get("roadmap"):
        meta = dict(meta)
        meta["roadmap"] = _remap_roadmap(dict(meta["roadmap"]), idmap)
    await db.update_run(
        run_id,
        domain=dbsnap.get("domain", config.get("domain", "")),
        title=dbsnap.get("title", config.get("title", goal[:80])),
        meta_json=db._j(meta),
    )
    return idmap


# Per-event-type pacing for the replay (seconds).
_PACE = {
    "agent_thinking": 0.018,
    "stage": 0.35,
    "hypothesis_added": 0.22,
    "debate_result": 0.45,
    "score_updated": 0.4,
    "novelty_checked": 0.45,
    "prior_failure_checked": 0.45,
    "plausibility_checked": 0.45,
    "datasets_found": 0.3,
    "enrichment_ready": 0.4,
    "hypothesis_eliminated": 0.3,
    "hypothesis_critiqued": 0.05,
    "agent_started": 0.05,
    "agent_output": 0.05,
    "papers_loaded": 0.4,
    "gaps_done": 0.5,
    "contradictions_done": 0.5,
    "round_done": 0.3,
}


async def replay(run_id: str, demo_id: str, goal: str, config: dict, bus: Any,
                 speed: float = 1.0) -> None:
    """Replay a recorded demo run under a new run_id."""
    snap = load_snapshot(demo_id)
    idmap = await _materialize(run_id, snap["db"], goal, config)

    def rm(x):
        return idmap.get(x, x)

    def remap_event(ev: str, data: dict) -> dict:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        for k in ("id", "winner_id", "a_id", "b_id"):
            if k in d:
                d[k] = rm(d[k])
        if "parent_ids" in d:
            d["parent_ids"] = [rm(x) for x in (d["parent_ids"] or [])]
        return d

    events = snap.get("events", [])
    # Cap consecutive reasoning chunks per burst — the big synthesis calls record
    # tens of thousands of tokens, and we want the replay to stay snappy.
    THINK_BURST_CAP = 110
    think_run = 0
    for item in events:
        ev, data = item.get("event"), item.get("data", {})
        if ev in ("run_complete", "stream_end"):
            continue
        if ev == "agent_thinking":
            think_run += 1
            if think_run > THINK_BURST_CAP:
                continue
        else:
            think_run = 0
        await bus.emit(ev, remap_event(ev, data))
        delay = _PACE.get(ev, 0.06) * speed
        if delay:
            await asyncio.sleep(delay)

    await db.update_run(run_id, status="complete", stage="complete")
    stats = (snap["db"].get("meta", {}) or {}).get("stats", {})
    await bus.emit("stage", {"stage": "complete", "label": "Complete", "progress": 100})
    await bus.emit("run_complete", {"run_id": run_id, "stats": stats})
