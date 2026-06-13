"""
Discovery Engine orchestrator.

Runs the cyclical multi-agent pipeline as a background asyncio task, emitting
SSE events through the run's EventBus and persisting everything to SQLite.

Stages: literature -> graph -> gaps -> contradictions -> hypothesis_gen ->
critique -> (tournament round -> evolution) xN -> scoring -> meta_review.
"""

from __future__ import annotations

import asyncio
import random
from typing import Any

from . import agents, db, demos, snapshot
from .bus import EventBus

K_FACTOR = 32
ELO_MIN, ELO_MAX = 600, 1400
MAX_CONCURRENCY = 6

STAGES = [
    ("literature", "Literature Scout"),
    ("graph", "Knowledge Graph"),
    ("gaps", "Gap Discovery"),
    ("contradictions", "Contradiction Engine"),
    ("hypothesis_gen", "Hypothesis Generation"),
    ("critique", "Skeptic Review"),
    ("tournament", "Elo Tournament"),
    ("scoring", "Discovery Scoring"),
    ("meta_review", "Meta-Review"),
    ("complete", "Complete"),
]


def _expected(a: float, b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((b - a) / 400.0))


def _clamp(x: float) -> float:
    return max(ELO_MIN, min(ELO_MAX, x))


async def _emit_stage(bus: EventBus, run_id: str, stage: str, label: str) -> None:
    idx = next((i for i, (s, _) in enumerate(STAGES) if s == stage), 0)
    progress = round(idx / (len(STAGES) - 1) * 100)
    await db.update_run(run_id, stage=stage)
    await bus.emit("stage", {"stage": stage, "label": label, "progress": progress})


async def _gather_limited(coros: list, limit: int = MAX_CONCURRENCY) -> list:
    sem = asyncio.Semaphore(limit)

    async def _wrap(c):
        async with sem:
            return await c

    return await asyncio.gather(*[_wrap(c) for c in coros], return_exceptions=True)


async def run_pipeline(run_id: str, goal: str, config: dict, bus: EventBus,
                       demo_id: str = "") -> None:
    try:
        if snapshot.has_snapshot(demo_id):
            await bus.emit("run_started", {"run_id": run_id, "goal": goal})
            await snapshot.replay(run_id, demo_id, goal, config, bus)
        else:
            await _run(run_id, goal, config, bus, demo_id)
    except Exception as exc:  # noqa: BLE001
        await db.update_run(run_id, status="error", stage="error")
        await bus.emit("run_error", {"error": str(exc)})
    finally:
        await bus.close()


async def _run(run_id: str, goal: str, config: dict, bus: EventBus,
               demo_id: str) -> None:
    # ---- Supervisor + research memory ----
    await bus.emit("run_started", {"run_id": run_id, "goal": goal})
    domain_hint = config.get("domain", "")
    memory = await db.get_memory(domain_hint) if domain_hint else None
    plan = await agents.supervisor(run_id, goal, config, memory, bus)
    domain = plan.get("research_domain", domain_hint or "General Science")
    max_hyp = plan["max_hypotheses"]
    rounds = plan["debate_rounds"]
    await db.update_run(run_id, domain=domain, title=config.get("title", goal[:80]),
                        meta_json=db._j({"plan": plan,
                                         "memory_used": bool(memory)}))
    await bus.emit("plan", {"domain": domain, "max_hypotheses": max_hyp,
                            "debate_rounds": rounds,
                            "focus_areas": plan.get("focus_areas", []),
                            "memory_used": bool(memory)})

    # ---- Stage 1: Literature ----
    # Abstracts are fed directly into the graph/hypothesis agents; we avoid a
    # per-paper extraction call (each K2-Think call is 40-100s, so 14 of them
    # would dominate the run). Concept extraction happens inside the graph step.
    await _emit_stage(bus, run_id, "literature", "Literature Scout")
    raw_papers = await _load_papers(demo_id, plan, config, bus)
    await bus.emit("papers_loaded", {"count": len(raw_papers),
                                     "source": config.get("source", "mixed")})
    papers = []
    for p in raw_papers:
        pid = await db.insert_paper(run_id, p)
        p["id"] = pid
        papers.append(p)
    await bus.emit("literature_done", {"papers": len(papers)})

    # ---- Stage 2: Knowledge graph ----
    await _emit_stage(bus, run_id, "graph", "Knowledge Graph")
    graph = await agents.knowledge_graph(run_id, papers, bus)

    # ---- Stage 3: Gaps ----
    await _emit_stage(bus, run_id, "gaps", "Gap Discovery")
    gaps = await agents.gap_discovery(run_id, graph, bus)
    graph["gaps"] = gaps
    await bus.emit("gaps_done", {"count": len(gaps),
                                 "gaps": [{"title": g.get("title"),
                                           "type": g.get("type")} for g in gaps[:6]]})

    # ---- Stage 4: Contradictions ----
    await _emit_stage(bus, run_id, "contradictions", "Contradiction Engine")
    contradictions = await agents.contradiction_engine(
        run_id, graph.get("contradictions", []), bus)
    graph["contradictions"] = contradictions or graph.get("contradictions", [])
    await db.save_graph(run_id, graph)
    await bus.emit("contradictions_done", {"count": len(contradictions)})

    # ---- Stage 5: Hypothesis generation ----
    await _emit_stage(bus, run_id, "hypothesis_gen", "Hypothesis Generation")
    hyps = await agents.generate_hypotheses(
        run_id, goal, papers, gaps, contradictions, max_hyp, bus)
    pool: dict[str, dict] = {}
    for i, h in enumerate(hyps):
        if not isinstance(h, dict) or not h.get("title"):
            continue
        h["generation_type"] = "original"
        h["elo_score"] = 1000.0
        hid = await db.insert_hypothesis(run_id, h)
        h["id"] = hid
        pool[hid] = h
        await bus.emit("hypothesis_added", {"id": hid, "title": h.get("title"),
                                            "archetype": h.get("archetype", ""),
                                            "elo": 1000, "generation_type": "original"})

    # ---- Stage 6: Skeptic ----
    await _emit_stage(bus, run_id, "critique", "Skeptic Review")
    await _critique_pool(run_id, list(pool.values()), pool, bus)

    # ---- Stage 7: Tournament + Evolution cycles ----
    await _emit_stage(bus, run_id, "tournament", "Elo Tournament")
    for rnd in range(1, rounds + 1):
        active = [h for h in pool.values() if h.get("status", "active") == "active"]
        await _tournament_round(run_id, active, rnd, bus)
        await bus.emit("round_done", {"round": rnd})
        # Evolution between rounds (not after the last round).
        if rnd < rounds:
            top = sorted(active, key=lambda h: h["elo_score"], reverse=True)[:5]
            evolved = await agents.evolution(run_id, top, bus)
            new_ones = []
            for e in evolved:
                if not isinstance(e, dict) or not e.get("title"):
                    continue
                e["generation_type"] = "evolved"
                e["elo_score"] = 1000.0
                hid = await db.insert_hypothesis(run_id, e)
                e["id"] = hid
                pool[hid] = e
                new_ones.append(e)
                await bus.emit("hypothesis_added",
                               {"id": hid, "title": e.get("title"),
                                "archetype": e.get("archetype", "EVOLVED"),
                                "elo": 1000, "generation_type": "evolved",
                                "parent_ids": e.get("parent_ids", [])})
            if new_ones:
                await _critique_pool(run_id, new_ones, pool, bus)

    # ---- Stage 8: Discovery scoring ----
    await _emit_stage(bus, run_id, "scoring", "Discovery Scoring")
    active = [h for h in pool.values() if h.get("status", "active") == "active"]
    top10 = sorted(active, key=lambda h: h["elo_score"], reverse=True)[:8]
    await _score_hypotheses(run_id, top10, bus)

    # ---- Stage 9: Meta-review ----
    await _emit_stage(bus, run_id, "meta_review", "Meta-Review")
    scores = await db.get_scores(run_id)
    for h in top10:
        s = scores.get(h["id"])
        if s:
            h["discovery_score"] = s.get("discovery_score")
    stats = {"papers": len(papers), "hypotheses": len(pool),
             "eliminated": sum(1 for h in pool.values() if h.get("status") == "eliminated"),
             "debates": len(await db.get_debates(run_id)),
             "gaps": len(gaps), "contradictions": len(contradictions)}
    roadmap = await agents.meta_review(run_id, goal, stats, top10,
                                       graph.get("contradictions", []), gaps, bus)
    meta = {"plan": plan, "stats": stats, "roadmap": roadmap,
            "memory_used": bool(memory)}
    await db.update_run(run_id, meta_json=db._j(meta))

    # ---- Research memory ----
    if roadmap:
        try:
            await db.save_memory(
                domain,
                roadmap.get("executive_summary", ""),
                [{"title": h.get("title"), "elo": round(h["elo_score"])}
                 for h in top10[:5]],
                [c.get("summary") for c in roadmap.get("key_contradictions", [])],
                [g.get("title") for g in gaps[:5]],
            )
        except Exception:
            pass

    await db.update_run(run_id, status="complete", stage="complete")
    await _emit_stage(bus, run_id, "complete", "Complete")
    await bus.emit("run_complete", {"run_id": run_id, "stats": stats})


async def _load_papers(demo_id: str, plan: dict, config: dict,
                       bus: EventBus) -> list[dict]:
    if demo_id:
        cached = demos.load_cached_papers(demo_id)
        if cached:
            return cached
    # Live fetch for custom goals.
    source = (config.get("source") or "").lower()
    queries = plan.get("search_queries", [])[:5]
    fetch = demos.fetch_arxiv if "arxiv" in source else demos.fetch_pubmed
    all_papers: list[dict] = []
    for q in queries:
        try:
            got = await fetch(q, 5)
            all_papers += got
        except Exception:
            continue
    if not all_papers and fetch is demos.fetch_pubmed:
        # Fallback to arxiv if pubmed yielded nothing.
        for q in queries:
            try:
                all_papers += await demos.fetch_arxiv(q, 5)
            except Exception:
                continue
    return demos.dedup(all_papers)[:14]


def _cscore(crit: dict) -> float:
    try:
        return float(crit.get("critique_score", 5))
    except (TypeError, ValueError):
        return 5.0


async def _critique_pool(run_id: str, targets: list[dict], pool: dict,
                         bus: EventBus) -> None:
    results = await _gather_limited(
        [agents.skeptic(run_id, h, bus) for h in targets]
    )
    crits = []
    for h, crit in zip(targets, results):
        if isinstance(crit, Exception) or not isinstance(crit, dict):
            crit = {"survival_threshold": "accept", "critique_score": 6.0}
        h["critique"] = crit
        crits.append((h, crit))

    # Candidate eliminations: explicit "eliminate" verdict AND a low score.
    elim_candidates = [
        h for h, c in crits
        if c.get("survival_threshold") == "eliminate" and _cscore(c) < 4.0
    ]
    # Guarantee a minimum viable pool so the tournament never collapses: keep at
    # least 6 (or 60% of this batch). If too many are flagged, spare the
    # strongest-critiqued ones. Evolved batches (small) are never eliminated.
    floor = len(targets) if len(targets) <= 4 else max(6, round(0.6 * len(targets)))
    max_elim = max(0, len(targets) - floor)
    if len(elim_candidates) > max_elim:
        elim_candidates.sort(key=lambda h: _cscore(h.get("critique") or {}))
        elim_set = set(id(h) for h in elim_candidates[:max_elim])
    else:
        elim_set = set(id(h) for h in elim_candidates)

    for h, crit in crits:
        status = "eliminated" if id(h) in elim_set else "active"
        h["status"] = status
        await db.update_hypothesis(h["id"], critique=crit, status=status)
        if status == "eliminated":
            await bus.emit("hypothesis_eliminated", {
                "id": h["id"], "title": h.get("title"),
                "reason": crit.get("strongest_counter_argument", "Eliminated by Skeptic."),
                "critique_score": crit.get("critique_score")})
        else:
            await bus.emit("hypothesis_critiqued", {
                "id": h["id"], "title": h.get("title"),
                "critique_score": crit.get("critique_score"),
                "verdict": crit.get("survival_threshold", "accept")})


def _swiss_pairings(hyps: list[dict], rnd: int) -> list[tuple[dict, dict]]:
    if rnd == 1:
        shuffled = hyps[:]
        random.shuffle(shuffled)
    else:
        shuffled = sorted(hyps, key=lambda h: h["elo_score"], reverse=True)
    pairs = []
    i = 0
    while i + 1 < len(shuffled):
        pairs.append((shuffled[i], shuffled[i + 1]))
        i += 2
    return pairs


async def _tournament_round(run_id: str, active: list[dict], rnd: int,
                            bus: EventBus) -> None:
    pairs = _swiss_pairings(active, rnd)
    if not pairs:
        return
    results = await _gather_limited(
        [agents.judge_matchup(run_id, a, b, rnd, bus) for a, b in pairs], limit=4
    )
    for (a, b), verdict in zip(pairs, results):
        if isinstance(verdict, Exception) or not isinstance(verdict, dict):
            continue
        winner, loser = (a, b) if verdict.get("winner") == "A" else (b, a)
        ea = _expected(winner["elo_score"], loser["elo_score"])
        winner["elo_score"] = _clamp(winner["elo_score"] + K_FACTOR * (1 - ea))
        loser["elo_score"] = _clamp(loser["elo_score"] + K_FACTOR * (0 - (1 - ea)))
        winner["wins"] = winner.get("wins", 0) + 1
        loser["losses"] = loser.get("losses", 0) + 1
        await db.update_hypothesis(winner["id"], elo_score=winner["elo_score"],
                                   wins=winner["wins"])
        await db.update_hypothesis(loser["id"], elo_score=loser["elo_score"],
                                   losses=loser["losses"])
        await db.insert_debate(run_id, {
            "round": rnd, "hyp_a_id": a["id"], "hyp_b_id": b["id"],
            "winner_id": winner["id"], "margin": verdict.get("margin", ""),
            "a_argument": verdict.get("a_argument", ""),
            "b_argument": verdict.get("b_argument", ""),
            "deciding_factor": verdict.get("deciding_factor", ""),
            "loser_improvement": verdict.get("loser_improvement", ""),
            "k2_think_trace": verdict.get("k2_think_trace", ""),
        })
        await bus.emit("debate_result", {
            "round": rnd, "a_id": a["id"], "b_id": b["id"],
            "a_title": a.get("title"), "b_title": b.get("title"),
            "winner_id": winner["id"], "winner_title": winner.get("title"),
            "margin": verdict.get("margin", ""),
            "deciding_factor": verdict.get("deciding_factor", ""),
            "a_elo": round(a["elo_score"]), "b_elo": round(b["elo_score"])})


async def _score_one(run_id: str, h: dict, bus: EventBus) -> None:
    dims = list(agents._DIM_PROMPTS.keys())
    results = await asyncio.gather(
        *[agents.score_dimension(run_id, h, d, bus) for d in dims],
        return_exceptions=True,
    )
    score_row: dict[str, Any] = {}
    rationale: dict[str, Any] = {}
    weighted = 0.0
    for dim, res in zip(dims, results):
        if isinstance(res, Exception) or not isinstance(res, dict):
            res = {"score": 50}
        val = res.get("score", 50)
        score_row[dim] = val
        rationale[dim] = res
        weighted += agents.SCORE_WEIGHTS[dim] * val
    score_row["discovery_score"] = round(weighted, 1)
    score_row["rationale"] = rationale
    await db.insert_score(run_id, h["id"], score_row)
    h["discovery_score"] = score_row["discovery_score"]
    await bus.emit("score_updated", {
        "id": h["id"], "title": h.get("title"),
        "discovery_score": score_row["discovery_score"],
        "dimensions": {d: score_row[d] for d in dims}})


async def _score_hypotheses(run_id: str, top: list[dict], bus: EventBus) -> None:
    # Score hypotheses concurrently (each fans out to 5 dimension calls).
    sem = asyncio.Semaphore(3)

    async def _wrap(h):
        async with sem:
            await _score_one(run_id, h, bus)

    await asyncio.gather(*[_wrap(h) for h in top], return_exceptions=True)
