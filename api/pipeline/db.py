"""SQLite persistence for the Discovery Engine (via aiosqlite)."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import aiosqlite

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "discovery.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, goal TEXT NOT NULL, domain TEXT, title TEXT,
  status TEXT DEFAULT 'running', stage TEXT, config_json TEXT,
  meta_json TEXT, demo_id TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY, run_id TEXT, source TEXT, ext_id TEXT, title TEXT,
  abstract TEXT, claims TEXT, methods TEXT, key_findings TEXT,
  limitations TEXT, future_work TEXT, entities TEXT, relationships TEXT,
  created_at REAL
);
CREATE TABLE IF NOT EXISTS hypotheses (
  id TEXT PRIMARY KEY, run_id TEXT, archetype TEXT, title TEXT, statement TEXT,
  mechanism TEXT, assumptions TEXT, supporting_evidence TEXT,
  predicted_outcome TEXT, falsifiable_prediction TEXT,
  elo_score REAL DEFAULT 1000, wins INTEGER DEFAULT 0, losses INTEGER DEFAULT 0,
  generation_type TEXT DEFAULT 'original', parent_ids TEXT,
  critique_json TEXT, status TEXT DEFAULT 'active', created_at REAL
);
CREATE TABLE IF NOT EXISTS debates (
  id TEXT PRIMARY KEY, run_id TEXT, round INTEGER, hyp_a_id TEXT, hyp_b_id TEXT,
  winner_id TEXT, margin TEXT, a_argument TEXT, b_argument TEXT,
  deciding_factor TEXT, loser_improvement TEXT, k2_think_trace TEXT,
  created_at REAL
);
CREATE TABLE IF NOT EXISTS scores (
  hypothesis_id TEXT PRIMARY KEY, run_id TEXT, evidence_strength REAL,
  novelty REAL, feasibility REAL, impact REAL, reproducibility REAL,
  discovery_score REAL, rationale_json TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY, run_id TEXT, agent_name TEXT, input_summary TEXT,
  output_json TEXT, think_trace TEXT, duration_ms INTEGER, created_at REAL
);
CREATE TABLE IF NOT EXISTS research_memory (
  id TEXT PRIMARY KEY, domain TEXT, summary TEXT, top_hypotheses TEXT,
  contradictions TEXT, gaps TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS knowledge_graph (
  run_id TEXT PRIMARY KEY, nodes_json TEXT, edges_json TEXT,
  contradictions_json TEXT, gaps_json TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS enrichment (
  hypothesis_id TEXT PRIMARY KEY, run_id TEXT,
  protocol_json TEXT, datasets_json TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS novelty (
  hypothesis_id TEXT PRIMARY KEY, run_id TEXT,
  novelty_json TEXT, prior_art_json TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS prior_failure (
  hypothesis_id TEXT PRIMARY KEY, run_id TEXT,
  failure_json TEXT, trials_json TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS plausibility (
  hypothesis_id TEXT PRIMARY KEY, run_id TEXT,
  plausibility_json TEXT, created_at REAL
);
"""


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()


def _now() -> float:
    return time.time()


def nid() -> str:
    return uuid.uuid4().hex[:12]


def _j(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


def _loads(v: Optional[str], default: Any = None) -> Any:
    if not v:
        return default
    try:
        return json.loads(v)
    except Exception:
        return default


# ---------- runs ----------
async def create_run(run_id: str, goal: str, config: dict, demo_id: str = "") -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO runs (id, goal, status, stage, config_json, demo_id, created_at)"
            " VALUES (?,?,?,?,?,?,?)",
            (run_id, goal, "running", "queued", _j(config), demo_id, _now()),
        )
        await db.commit()


async def clear_run(run_id: str) -> None:
    """Delete all rows for a run (used before re-recording a demo snapshot)."""
    async with aiosqlite.connect(DB_PATH) as db:
        for tbl in ("runs", "papers", "hypotheses", "debates", "scores",
                    "agent_logs", "knowledge_graph", "enrichment", "novelty",
                    "prior_failure", "plausibility"):
            col = "id" if tbl == "runs" else "run_id"
            await db.execute(f"DELETE FROM {tbl} WHERE {col}=?", (run_id,))
        await db.commit()


async def update_run(run_id: str, **fields: Any) -> None:
    if not fields:
        return
    cols = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [run_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE runs SET {cols} WHERE id=?", vals)
        await db.commit()


async def get_run(run_id: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM runs WHERE id=?", (run_id,))
        row = await cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["config"] = _loads(d.pop("config_json"), {})
    d["meta"] = _loads(d.pop("meta_json"), {})
    return d


async def list_runs() -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT id, goal, title, domain, status, demo_id, created_at FROM runs"
            " ORDER BY created_at DESC LIMIT 50"
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ---------- papers ----------
async def insert_paper(run_id: str, paper: dict) -> str:
    pid = paper.get("id") or nid()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO papers (id, run_id, source, ext_id, title, abstract,"
            " claims, methods, key_findings, limitations, future_work, entities,"
            " relationships, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                pid, run_id, paper.get("source", ""), paper.get("ext_id", ""),
                paper.get("title", ""), paper.get("abstract", ""),
                _j(paper.get("claims", [])), _j(paper.get("methods", [])),
                _j(paper.get("key_findings", [])), _j(paper.get("limitations", [])),
                _j(paper.get("future_work", [])), _j(paper.get("entities", [])),
                _j(paper.get("relationships", [])), _now(),
            ),
        )
        await db.commit()
    return pid


async def get_papers(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM papers WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        for k in ("claims", "methods", "key_findings", "limitations",
                  "future_work", "entities", "relationships"):
            d[k] = _loads(d[k], [])
        out.append(d)
    return out


# ---------- hypotheses ----------
async def insert_hypothesis(run_id: str, h: dict) -> str:
    hid = h.get("id") or nid()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO hypotheses (id, run_id, archetype, title, statement,"
            " mechanism, assumptions, supporting_evidence, predicted_outcome,"
            " falsifiable_prediction, elo_score, wins, losses, generation_type,"
            " parent_ids, critique_json, status, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                hid, run_id, h.get("archetype", ""), h.get("title", ""),
                h.get("statement", ""), h.get("mechanism", ""),
                _j(h.get("key_assumptions", h.get("assumptions", []))),
                _j(h.get("supporting_evidence", [])), h.get("predicted_outcome", ""),
                h.get("falsifiable_prediction", ""), h.get("elo_score", 1000),
                h.get("wins", 0), h.get("losses", 0),
                h.get("generation_type", "original"), _j(h.get("parent_ids", [])),
                _j(h.get("critique")), h.get("status", "active"), _now(),
            ),
        )
        await db.commit()
    return hid


async def update_hypothesis(hid: str, **fields: Any) -> None:
    if not fields:
        return
    if "critique" in fields:
        fields["critique_json"] = _j(fields.pop("critique"))
    cols = ", ".join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [hid]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE hypotheses SET {cols} WHERE id=?", vals)
        await db.commit()


def _hyp_row(r: aiosqlite.Row) -> dict:
    d = dict(r)
    d["assumptions"] = _loads(d.get("assumptions"), [])
    d["supporting_evidence"] = _loads(d.get("supporting_evidence"), [])
    d["parent_ids"] = _loads(d.get("parent_ids"), [])
    d["critique"] = _loads(d.pop("critique_json", None), None)
    return d


async def get_hypotheses(run_id: str, status: Optional[str] = None) -> list[dict]:
    q = "SELECT * FROM hypotheses WHERE run_id=?"
    args: list[Any] = [run_id]
    if status:
        q += " AND status=?"
        args.append(status)
    q += " ORDER BY elo_score DESC"
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(q, args)
        rows = await cur.fetchall()
    return [_hyp_row(r) for r in rows]


async def get_hypothesis(hid: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM hypotheses WHERE id=?", (hid,))
        row = await cur.fetchone()
    return _hyp_row(row) if row else None


# ---------- debates ----------
async def insert_debate(run_id: str, d: dict) -> str:
    did = nid()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO debates (id, run_id, round, hyp_a_id, hyp_b_id, winner_id,"
            " margin, a_argument, b_argument, deciding_factor, loser_improvement,"
            " k2_think_trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                did, run_id, d.get("round", 0), d.get("hyp_a_id"), d.get("hyp_b_id"),
                d.get("winner_id"), d.get("margin", ""), d.get("a_argument", ""),
                d.get("b_argument", ""), d.get("deciding_factor", ""),
                d.get("loser_improvement", ""), d.get("k2_think_trace", ""), _now(),
            ),
        )
        await db.commit()
    return did


async def get_debates(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM debates WHERE run_id=? ORDER BY round, created_at", (run_id,)
        )
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


# ---------- scores ----------
async def insert_score(run_id: str, hid: str, s: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO scores (hypothesis_id, run_id, evidence_strength,"
            " novelty, feasibility, impact, reproducibility, discovery_score,"
            " rationale_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                hid, run_id, s.get("evidence_strength"), s.get("novelty"),
                s.get("feasibility"), s.get("impact"), s.get("reproducibility"),
                s.get("discovery_score"), _j(s.get("rationale", {})), _now(),
            ),
        )
        await db.commit()


async def get_scores(run_id: str) -> dict[str, dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM scores WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    out = {}
    for r in rows:
        d = dict(r)
        d["rationale"] = _loads(d.pop("rationale_json"), {})
        out[d["hypothesis_id"]] = d
    return out


# ---------- enrichment (protocols + datasets) ----------
async def insert_enrichment(run_id: str, hid: str, protocol: Any,
                            datasets: Any) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO enrichment (hypothesis_id, run_id, protocol_json,"
            " datasets_json, created_at) VALUES (?,?,?,?,?)",
            (hid, run_id, _j(protocol), _j(datasets), _now()),
        )
        await db.commit()


async def get_enrichment(run_id: str) -> dict[str, dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM enrichment WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    out = {}
    for r in rows:
        out[r["hypothesis_id"]] = {
            "protocol": _loads(r["protocol_json"], {}),
            "datasets": _loads(r["datasets_json"], {}),
        }
    return out


# ---------- novelty (grounded prior-art verification) ----------
async def insert_novelty(run_id: str, hid: str, novelty: Any,
                         prior_art: Any) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO novelty (hypothesis_id, run_id, novelty_json,"
            " prior_art_json, created_at) VALUES (?,?,?,?,?)",
            (hid, run_id, _j(novelty), _j(prior_art), _now()),
        )
        await db.commit()


async def get_novelty(run_id: str) -> dict[str, dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM novelty WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    out = {}
    for r in rows:
        out[r["hypothesis_id"]] = {
            "novelty": _loads(r["novelty_json"], {}),
            "prior_art": _loads(r["prior_art_json"], []),
        }
    return out


# ---------- prior failure (clinical-trial reality check) ----------
async def insert_prior_failure(run_id: str, hid: str, failure: Any,
                               trials: Any) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO prior_failure (hypothesis_id, run_id, failure_json,"
            " trials_json, created_at) VALUES (?,?,?,?,?)",
            (hid, run_id, _j(failure), _j(trials), _now()),
        )
        await db.commit()


async def get_prior_failure(run_id: str) -> dict[str, dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM prior_failure WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    out = {}
    for r in rows:
        out[r["hypothesis_id"]] = {
            "failure": _loads(r["failure_json"], {}),
            "trials": _loads(r["trials_json"], []),
        }
    return out


# ---------- plausibility (mechanistic coherence) ----------
async def insert_plausibility(run_id: str, hid: str, plausibility: Any) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO plausibility (hypothesis_id, run_id,"
            " plausibility_json, created_at) VALUES (?,?,?,?)",
            (hid, run_id, _j(plausibility), _now()),
        )
        await db.commit()


async def get_plausibility(run_id: str) -> dict[str, dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM plausibility WHERE run_id=?", (run_id,))
        rows = await cur.fetchall()
    return {r["hypothesis_id"]: _loads(r["plausibility_json"], {}) for r in rows}


# ---------- knowledge graph ----------
async def save_graph(run_id: str, g: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO knowledge_graph (run_id, nodes_json, edges_json,"
            " contradictions_json, gaps_json, created_at) VALUES (?,?,?,?,?,?)",
            (
                run_id, _j(g.get("nodes", [])), _j(g.get("edges", [])),
                _j(g.get("contradictions", [])), _j(g.get("gaps", [])), _now(),
            ),
        )
        await db.commit()


async def get_graph(run_id: str) -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM knowledge_graph WHERE run_id=?", (run_id,))
        row = await cur.fetchone()
    if not row:
        return {"nodes": [], "edges": [], "contradictions": [], "gaps": []}
    d = dict(row)
    return {
        "nodes": _loads(d["nodes_json"], []),
        "edges": _loads(d["edges_json"], []),
        "contradictions": _loads(d["contradictions_json"], []),
        "gaps": _loads(d["gaps_json"], []),
    }


# ---------- agent logs ----------
async def log_agent(run_id: str, agent: str, inp: str, out: Any,
                    think: str, duration_ms: int) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO agent_logs (id, run_id, agent_name, input_summary,"
            " output_json, think_trace, duration_ms, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (nid(), run_id, agent, inp[:500], _j(out)[:20000],
             think[:20000], duration_ms, _now()),
        )
        await db.commit()


async def get_logs(run_id: str) -> list[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM agent_logs WHERE run_id=? ORDER BY created_at", (run_id,)
        )
        rows = await cur.fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["output"] = _loads(d.pop("output_json"), {})
        out.append(d)
    return out


# ---------- research memory ----------
async def save_memory(domain: str, summary: str, top: Any,
                      contradictions: Any, gaps: Any) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO research_memory (id, domain, summary, top_hypotheses,"
            " contradictions, gaps, created_at) VALUES (?,?,?,?,?,?,?)",
            (nid(), domain, summary, _j(top), _j(contradictions), _j(gaps), _now()),
        )
        await db.commit()


async def get_memory(domain: str) -> Optional[dict]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT * FROM research_memory WHERE domain=? ORDER BY created_at DESC LIMIT 1",
            (domain,),
        )
        row = await cur.fetchone()
    if not row:
        return None
    d = dict(row)
    d["top_hypotheses"] = _loads(d["top_hypotheses"], [])
    d["contradictions"] = _loads(d["contradictions"], [])
    d["gaps"] = _loads(d["gaps"], [])
    return d
