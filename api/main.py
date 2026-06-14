"""
Discovery Engine — FastAPI backend.

A cyclical multi-agent scientific discovery system powered by K2-Think-V2.
Exposes run creation, a live SSE event stream, and read endpoints for
hypotheses, debates, the knowledge graph, contradictions, and the roadmap.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from api.pipeline import db, demos, orchestrator  # noqa: E402
from api.pipeline.bus import get_bus, sse_format  # noqa: E402

app = FastAPI(title="Discovery Engine API", version="3.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup() -> None:
    await db.init_db()


class RunRequest(BaseModel):
    goal: str = ""
    demo_id: Optional[str] = None
    source: Optional[str] = None
    max_hypotheses: Optional[int] = None
    debate_rounds: Optional[int] = None
    title: Optional[str] = None
    domain: Optional[str] = None


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "model": os.getenv("K2_MODEL")}


@app.get("/demos")
async def get_demos() -> list[dict]:
    return [
        {k: d[k] for k in ("id", "title", "domain", "description", "goal",
                           "max_hypotheses", "debate_rounds", "source")}
        for d in demos.DEMOS
        if d.get("active", True)
    ]


@app.get("/runs")
async def get_runs() -> list[dict]:
    return await db.list_runs()


@app.post("/run")
async def create_run(req: RunRequest) -> dict:
    demo_id = req.demo_id or ""
    if demo_id:
        demo = demos.DEMO_BY_ID.get(demo_id)
        if not demo:
            raise HTTPException(404, "Unknown demo")
        config = {
            "title": demo["title"], "domain": demo["domain"],
            "source": demo["source"], "search_queries": demo["search_queries"],
            "max_hypotheses": req.max_hypotheses or demo["max_hypotheses"],
            "debate_rounds": req.debate_rounds or demo["debate_rounds"],
        }
        goal = req.goal or demo["goal"]
    else:
        if not req.goal.strip():
            raise HTTPException(400, "goal is required for custom runs")
        config = {
            "title": req.title or req.goal[:80],
            "domain": req.domain or "",
            "source": req.source or "PubMed",
            "search_queries": [],
            "max_hypotheses": req.max_hypotheses or 16,
            "debate_rounds": req.debate_rounds or 3,
        }
        goal = req.goal

    run_id = uuid.uuid4().hex[:12]
    await db.create_run(run_id, goal, config, demo_id)
    bus = get_bus(run_id)
    asyncio.create_task(
        orchestrator.run_pipeline(run_id, goal, config, bus, demo_id)
    )
    return {"run_id": run_id, "goal": goal, "config": config}


@app.get("/run/{run_id}/stream")
async def stream(run_id: str) -> StreamingResponse:
    bus = get_bus(run_id)

    async def gen() -> AsyncGenerator[str, None]:
        q = bus.subscribe()
        yield ": connected\n\n"
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if item is None:
                    yield sse_format({"event": "stream_end", "data": {}})
                    break
                yield sse_format(item)
        finally:
            bus.unsubscribe(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.get("/run/{run_id}")
async def run_state(run_id: str) -> dict:
    run = await db.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@app.get("/run/{run_id}/hypotheses")
async def run_hypotheses(run_id: str) -> dict:
    hyps = await db.get_hypotheses(run_id)
    scores = await db.get_scores(run_id)
    novelty = await db.get_novelty(run_id)
    failure = await db.get_prior_failure(run_id)
    plausibility = await db.get_plausibility(run_id)
    for h in hyps:
        s = scores.get(h["id"])
        if s:
            h["scores"] = s
        nv = (novelty.get(h["id"]) or {}).get("novelty")
        if nv:
            h["novelty"] = {
                "novelty_score": nv.get("novelty_score"),
                "verdict": nv.get("verdict"),
                "recombination_penalty": nv.get("recombination_penalty"),
            }
        pf = (failure.get(h["id"]) or {}).get("failure")
        if pf:
            h["prior_failure"] = {
                "verdict": pf.get("verdict"),
                "already_tried": pf.get("already_tried"),
            }
        pl = plausibility.get(h["id"])
        if pl:
            h["plausibility"] = {
                "plausibility_score": pl.get("plausibility_score"),
                "verdict": pl.get("verdict"),
            }
    return {"hypotheses": hyps}


@app.get("/run/{run_id}/hypothesis/{hid}")
async def hypothesis_detail(run_id: str, hid: str) -> dict:
    h = await db.get_hypothesis(hid)
    if not h:
        raise HTTPException(404, "Hypothesis not found")
    scores = await db.get_scores(run_id)
    h["scores"] = scores.get(hid)
    debates = [d for d in await db.get_debates(run_id)
               if d["hyp_a_id"] == hid or d["hyp_b_id"] == hid]
    h["debates"] = debates
    enr = (await db.get_enrichment(run_id)).get(hid, {})
    h["protocol"] = enr.get("protocol")
    h["datasets"] = enr.get("datasets")
    nov = (await db.get_novelty(run_id)).get(hid, {})
    h["novelty"] = nov.get("novelty")
    h["prior_art"] = nov.get("prior_art")
    pf = (await db.get_prior_failure(run_id)).get(hid, {})
    h["prior_failure"] = pf.get("failure")
    h["trials"] = pf.get("trials")
    h["plausibility"] = (await db.get_plausibility(run_id)).get(hid)
    return {"hypothesis": h}


@app.get("/run/{run_id}/debates")
async def run_debates(run_id: str) -> dict:
    debates = await db.get_debates(run_id)
    hyps = {h["id"]: h for h in await db.get_hypotheses(run_id)}
    return {"debates": debates, "hypotheses": hyps}


@app.get("/run/{run_id}/graph")
async def run_graph(run_id: str) -> dict:
    return await db.get_graph(run_id)


@app.get("/run/{run_id}/contradictions")
async def run_contradictions(run_id: str) -> dict:
    g = await db.get_graph(run_id)
    return {"contradictions": g.get("contradictions", [])}


@app.get("/run/{run_id}/logs")
async def run_logs(run_id: str) -> dict:
    return {"logs": await db.get_logs(run_id)}
